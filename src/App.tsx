import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import HCaptcha from '@hcaptcha/react-hcaptcha';
import {
  Activity, Archive, ArrowDownToLine, ArrowRight, Bell, Bot, Building2, CalendarClock, Check, CheckCircle2, CheckCheck,
  CircleAlert, ClipboardList, Cloud, FileCheck2, FileSpreadsheet, FileText, Filter, Flame,
  Gauge, HelpCircle, Home, LoaderCircle, LockKeyhole, LogOut, MapPin, Menu, MessageCircle, MoreHorizontal,
  Search, Send, Settings, ShieldCheck, Sparkles, X, RefreshCw, Eye, EyeOff, BadgeCheck, Clock3, ListChecks, CirclePause, RotateCcw, UserX, PanelLeftClose, PanelLeftOpen,
  Plus, Pause, Play, Trash2, Pencil, KeyRound, CalendarDays, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, formatArea, formatDate, statusTone, type Building, type BuildingDetail, type Dashboard, type DashboardProcess, type DocumentItem, type ProcessDetail, type ProcessMenuFilter, type ProcessMenuFilters, type ProcessMenuKey } from './types';
import { downloadExcelReport, type ExcelCell } from './excel';
import fireStationHero from './assets/fire-station-hero.webp';

const logo = <span className="brand-mark"><Flame size={21} strokeWidth={2.5} /></span>;

function ExcelExportButton({ filename, sheetName, columns, rows }: { filename: string; sheetName: string; columns: string[]; rows: ExcelCell[][] }) {
  return <button type="button" className="button button-outline excel-export-button" onClick={() => downloadExcelReport({ filename, sheetName, columns, rows })}><FileSpreadsheet size={15} /> Exportar Excel</button>;
}

function Landing() {
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();
  async function enterDemo() {
    setDemoLoading(true);
    try { await api('/api/auth/demo', { method: 'POST' }); navigate('/painel'); }
    catch { setDemoLoading(false); }
  }
  return <main className="landing">
    <nav className="public-nav wrap">
      <Link to="/" className="brand">{logo}<span>Fênix <b>Painel</b></span></Link>
      <div className="public-links"><a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#seguranca">Segurança</a></div>
      <Link className="button button-teal button-sm" to="/entrar">Acessar painel <ArrowRight size={15} /></Link>
    </nav>
    <section className="hero wrap">
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-dot" /> ACOMPANHAMENTO INTELIGENTE DE EDIFICAÇÕES</div>
        <h1>Acompanhe edificações,<br />projetos <em>e aprovações</em><br />do Corpo de Bombeiros.</h1>
        <p>O Fênix Painel centraliza as informações das edificações e dos processos de segurança contra incêndio, com visão clara do status, prazos e próximas ações.</p>
        <div className="hero-actions">
          <Link className="button button-teal" to="/entrar">Acessar painel <ArrowRight size={17} /></Link>
          <button className="button button-outline-light" onClick={enterDemo} disabled={demoLoading}>{demoLoading ? <LoaderCircle className="spin" size={16} /> : <Eye size={16} />} Ver demonstração</button>
        </div>
        <div className="hero-notes"><span><Activity size={16} /> Atualização automática</span><span><Sparkles size={16} /> IA com contexto</span><span><ShieldCheck size={16} /> Acesso Fênix</span></div>
      </div>
      <div className="hero-visual">
        <img className="hero-photo" src={fireStationHero} alt="Quartel de bombeiros moderno na Bahia, com viatura no pátio" />
        <div className="hero-ai"><span className="ai-icon"><Sparkles size={17} /></span><span><b>Resumo inteligente</b><small>A IA destaca o que precisa da sua atenção.</small></span><ArrowRight size={17} /></div>
      </div>
    </section>
    <section className="landing-features wrap" id="recursos">
      <div className="feature"><span><Building2 size={19} /></span><div><b>Edificações e processos</b><small>Uma visão organizada por imóvel, protocolo e etapa.</small></div></div>
      <div className="feature"><span><RefreshCw size={19} /></span><div><b>Atualização recorrente</b><small>Sincronização planejada a cada 30 minutos.</small></div></div>
      <div className="feature"><span><Sparkles size={19} /></span><div><b>IA que explica o contexto</b><small>Entenda pendências usando os dados do processo.</small></div></div>
    </section>
    <section className="landing-bottom" id="como-funciona"><div className="wrap bottom-content"><div><div className="eyebrow eyebrow-dark">ACESSO INTEGRADO</div><h2>Entre com sua conta<br />do Fênix.</h2><p>Sem novo cadastro. O acesso é validado pelo sistema Fênix e protegido com hCaptcha.</p></div><div className="bottom-steps"><div><b>01</b><span><strong>Conecte</strong><small>Use seu usuário e senha do Fênix.</small></span></div><div><b>02</b><span><strong>Acompanhe</strong><small>Veja edificações, processos e atualizações.</small></span></div><div><b>03</b><span><strong>Entenda</strong><small>Peça à IA para explicar dados e etapas.</small></span></div></div></div></section>
    <footer className="public-footer wrap" id="seguranca"><Link to="/" className="brand">{logo}<span>Fênix <b>Painel</b></span></Link><span>Uma camada de acompanhamento para os processos do CBMBA.</span><span className="footer-security"><LockKeyhole size={14} /> Acesso validado pelo Fênix</span></footer>
  </main>;
}

function LoginProgress({ stage, completed, failed, syncWarning }: { stage: number; completed: number[]; failed: boolean; syncWarning: boolean }) {
  const steps = ['Abrindo conexão HTTPS com o Fênix', 'Preparando a sessão de autenticação', 'Enviando credenciais protegidas por HTTPS e token hCaptcha', 'Fênix validando credenciais e hCaptcha', 'Acesso aprovado pelo Fênix', 'Carregando edificações e processos', 'Painel pronto'];
  const activeStage = Math.max(0, Math.min(stage, steps.length - 1));
  const doneCount = completed.length;
  return <section className={`login-progress ${failed ? 'login-progress-failed' : ''}`} aria-live="polite" aria-label="Etapas de autenticação">
    <div className="login-progress-heading"><b>{failed ? 'Não foi possível concluir o acesso' : stage === 6 ? 'Acesso aprovado' : 'Acompanhando seu acesso'}</b><span>{failed ? 'Revise os dados ou tente novamente' : `${Math.min(doneCount, steps.length)} de ${steps.length} etapas`}</span></div>
    <div className="login-progress-track"><i style={{ width: `${Math.min(100, doneCount / steps.length * 100)}%` }} /></div>
    <ol>{steps.map((label, index) => {
      const isDone = completed.includes(index) && !(failed && index === activeStage);
      const isCurrent = index === activeStage && !isDone && !failed;
      return <li key={label} className={isDone ? 'done' : isCurrent ? 'current' : failed && index === activeStage ? 'failed' : ''}>
        <span className="login-step-icon">{isDone ? <Check size={13} /> : isCurrent ? <LoaderCircle size={13} className="spin" /> : failed && index === activeStage ? <CircleAlert size={13} /> : index + 1}</span><span>{label}</span>
      </li>;
    })}</ol>
    {syncWarning && <small className="login-sync-warning">Acesso aprovado. A primeira sincronização não terminou; você pode atualizar os dados dentro do painel.</small>}
  </section>;
}

function Login() {
  const navigate = useNavigate();
  const [siteKey, setSiteKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginInProgress, setLoginInProgress] = useState(false);
  const [error, setError] = useState('');
  const [loginStage, setLoginStage] = useState(-1);
  const [loginCompleted, setLoginCompleted] = useState<number[]>([]);
  const [loginSyncWarning, setLoginSyncWarning] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  useEffect(() => { api<{ hcaptchaSiteKey: string }>('/api/config').then((r) => setSiteKey(r.hcaptchaSiteKey)).catch(() => setError('Não foi possível carregar a tela de acesso.')); }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!token) { setError('Conclua a verificação do hCaptcha para continuar.'); return; }
    setLoading(true); setLoginInProgress(true); setLoginStage(-1); setLoginCompleted([]); setLoginSyncWarning(false);
    const progressId = crypto.randomUUID();
    const poller = window.setInterval(() => {
      void api<{ stage: number; completedStages: number[]; syncWarning?: boolean }>(`/api/auth/login/progress/${progressId}`).then((progress) => {
        setLoginStage((current) => Math.max(current, progress.stage));
        setLoginCompleted((current) => [...new Set([...current, ...progress.completedStages])]);
        if (progress.syncWarning) setLoginSyncWarning(true);
      }).catch(() => undefined);
    }, 300);
    try {
      const result = await api<{ syncWarning?: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, hcaptchaToken: token, progressId }) });
      if (result.syncWarning) setLoginSyncWarning(true);
      window.clearInterval(poller); setLoginStage(6); setLoginCompleted([0, 1, 2, 3, 4, 5, 6]);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      navigate('/painel');
    }
    catch (e) {
      window.clearInterval(poller);
      const message = e instanceof Error ? e.message : 'Falha ao entrar.';
      setError(message); setToken(''); captchaRef.current?.resetCaptcha();
      const progress = await api<{ stage: number; completedStages: number[]; syncWarning?: boolean }>(`/api/auth/login/progress/${progressId}`).catch(() => null);
      if (progress) { setLoginStage(progress.stage); setLoginCompleted(progress.completedStages); }
    }
    finally { setLoading(false); setLoginInProgress(false); }
  }
  async function demo() { setLoading(true); try { await api('/api/auth/demo', { method: 'POST' }); navigate('/painel'); } finally { setLoading(false); } }
  return <main className="login-page">
    <section className="login-brand-panel"><Link to="/" className="brand brand-light">{logo}<span>Fênix <b>Painel</b></span></Link><div className="login-brand-copy"><div className="eyebrow"><span className="eyebrow-dot" /> CONEXÃO OFICIAL</div><h1>Acesse com suas<br />credenciais do Fênix</h1><p>Utilize o mesmo usuário e senha que já usa no sistema Fênix do Corpo de Bombeiros. Não é necessário criar um novo cadastro.</p><div className="login-benefits"><span><ShieldCheck /> Acesso integrado e seguro</span><span><BadgeCheck /> Seus dados já existentes no Fênix</span><span><LockKeyhole /> Sem cadastro adicional</span></div></div></section>
    <section className="login-form-panel"><div className="login-form-wrap"><div className="login-heading"><span className="form-kicker">BEM-VINDO(A)</span><h2>Entrar no Fênix Painel</h2><p>Informe suas credenciais do sistema Fênix.</p></div>
      <form onSubmit={submit} className="login-form"><label>E-mail<div className="input-icon"><span>@</span><input type="text" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu.email@exemplo.gov.br" required /></div></label><label>Senha<div className="input-icon"><LockKeyhole size={16} /><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha do Fênix" required /><button type="button" className="input-trailing" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
      <div className="captcha-wrap">{siteKey && <HCaptcha ref={captchaRef} sitekey={siteKey} onVerify={(value) => setToken(value)} onExpire={() => setToken('')} onError={() => setError('Não foi possível validar o hCaptcha. Tente novamente.')} />}</div>
      {error && <div className="form-error"><CircleAlert size={16} /> {error}</div>}
      {(loginInProgress || (loginStage >= 0 && Boolean(error))) && <LoginProgress stage={loginStage} completed={loginCompleted} failed={Boolean(error)} syncWarning={loginSyncWarning} />}
      <button className="button button-teal button-wide" type="submit" disabled={loading || !siteKey}>{loading ? <><LoaderCircle size={16} className="spin" /> Validando acesso...</> : <>Entrar com Fênix <ArrowRight size={16} /></>}</button>
      <div className="secure-note"><LockKeyhole size={14} /><span>Suas credenciais são enviadas ao Fênix para autenticação. O Fênix Painel não armazena sua senha.</span></div>
      <div className="login-divider"><span>ou</span></div><button type="button" className="button button-outline button-wide" onClick={demo} disabled={loading}><Eye size={16} /> Explorar ambiente de demonstração</button>
      </form><p className="login-privacy">Não é necessário criar um novo cadastro.</p>
    </div></section>
  </main>;
}

type NavItem = { label: string; icon: typeof Home; path?: string };
type UserNotification = { id: number; buildingId: string | null; processId: string | null; title: string; message: string; createdAt: string; readAt: string | null; sourceAccountName?: string | null; sourceAccountPaused?: boolean };
type RenewalRecord = { id: string; buildingId: string; buildingReference: string; municipality: string; sourceAccountName?: string | null; sourceConnectionId?: string | null; sourceAccountPaused?: boolean; protocol: string; type: string; status: string; stage: string; homologatedAt: string; renewalAt: string; monthsUntilRenewal: number; daysUntilRenewal: number; severity: 'normal' | 'attention' | 'urgent' | 'overdue'; urgency: 'current' | 'next' | 'upcoming' | 'later'; disposition: 'archived' | 'lost' | null };
const navItems: NavItem[] = [
  { label: 'Visão geral', icon: Home, path: '/painel' },
  { label: 'Edificações', icon: Building2, path: '/painel?view=buildings' },
  { label: 'Em Análise', icon: ClipboardList, path: '/painel?view=analysis' },
  { label: 'Notificados', icon: FileCheck2, path: '/painel?view=notified' },
  { label: 'Parados', icon: CirclePause, path: '/painel?view=stopped' },
  { label: 'AVCBs e CLCBs', icon: ShieldCheck, path: '/painel?view=certificates' },
  { label: 'Projetos (ACP)', icon: FileText, path: '/painel?view=projects' },
  { label: 'Renovações', icon: CalendarClock, path: '/painel?view=renewals' },
  { label: 'Consultas', icon: Search, path: '/painel?view=sync' },
  { label: 'Log do webhook', icon: ListChecks, path: '/log' }
];

const DEFAULT_PROCESS_MENU_FILTERS: ProcessMenuFilters = {
  analysis: { typeTerms: [], stageTerms: ['análise'], join: 'all' },
  notified: { typeTerms: [], stageTerms: ['notific'], join: 'all' },
  stopped: { typeTerms: [], stageTerms: ['rascunho de protocolo', 'pendente de documentação', 'pendente de encaminhamento'], join: 'all' },
  certificates: { typeTerms: ['avcb', 'clcb', 'certific'], stageTerms: [], join: 'all' },
  projects: { typeTerms: ['projeto'], stageTerms: [], join: 'all' }
};
const PROCESS_MENU_LABELS: Record<ProcessMenuKey, string> = {
  analysis: 'Em Análise', notified: 'Notificados', stopped: 'Parados', certificates: 'AVCBs e CLCBs', projects: 'Projetos (ACP)'
};
function normalizeMenuTerm(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR'); }
function matchesProcessMenuFilter(process: DashboardProcess, filter: ProcessMenuFilter) {
  const type = normalizeMenuTerm(process.type);
  const stage = normalizeMenuTerm(`${process.status} ${process.stage}`);
  const matchesType = filter.typeTerms.length ? filter.typeTerms.some((term) => type.includes(normalizeMenuTerm(term))) : null;
  const matchesStage = filter.stageTerms.length ? filter.stageTerms.some((term) => stage.includes(normalizeMenuTerm(term))) : null;
  const groups = [matchesType, matchesStage].filter((value): value is boolean => value !== null);
  if (!groups.length) return false;
  return filter.join === 'any' ? groups.some(Boolean) : groups.every(Boolean);
}

function Shell({ children, user, active = 'Visão geral', breadcrumbs, onNavigate, onNotification, onOpenAi, onSyncRunningChange }: { children: ReactNode; user: { name: string; demo: boolean }; active?: string; breadcrumbs?: ReactNode; onNavigate?: () => void; onNotification?: (notification: UserNotification) => void; onOpenAi?: () => void; onSyncRunningChange?: (running: boolean) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('fenix-sidebar-collapsed') === 'true');
  const [helpOpen, setHelpOpen] = useState(false);
  const [fenixSync, setFenixSync] = useState<{ status: string; startedAt: string | null; lastSync?: string | null; phase?: string; total?: number; processed?: number; failed?: number; message?: string; requestQueue?: { queued: number; recentCount: number; limitPerMinute: number } }>({ status: 'idle', startedAt: null, lastSync: null });
  const [clock, setClock] = useState(Date.now());
  const navigate = useNavigate();
  useEffect(() => {
    const refreshStatus = () => void api<typeof fenixSync>('/api/sync/status').then(setFenixSync).catch(() => undefined);
    refreshStatus();
    const timer = window.setInterval(refreshStatus, 3000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { onSyncRunningChange?.(fenixSync.status === 'running'); }, [fenixSync.status, onSyncRunningChange]);
  useEffect(() => {
    if (fenixSync.status !== 'running') return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [fenixSync.status]);
  const elapsedSeconds = fenixSync.startedAt ? Math.max(0, Math.floor((clock - Date.parse(fenixSync.startedAt)) / 1000)) : 0;
  const elapsed = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const connectionLabel = user.demo ? 'Demonstração' : fenixSync.status === 'running' ? `Atualizando · ${elapsed}` : fenixSync.status === 'partial' || fenixSync.status === 'interrupted' ? 'Atualização incompleta' : fenixSync.status === 'error' ? 'Falha na atualização' : 'Conectado ao Fênix';
  const lastSyncDate = fenixSync.lastSync && Number.isFinite(Date.parse(fenixSync.lastSync)) ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bahia' }).format(new Date(fenixSync.lastSync)) : null;
  const lastSyncTitle = fenixSync.lastSync && Number.isFinite(Date.parse(fenixSync.lastSync)) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bahia' }).format(new Date(fenixSync.lastSync)) : null;
  function navigateFromSidebar(path: string) { setMenuOpen(false); onNavigate?.(); navigate(path); }
  async function logout() { await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined); navigate('/'); }
  return <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
    <Link to="/" className="brand brand-light sidebar-brand">{logo}<span>Fênix <b>Painel</b></span></Link>
    <div className="sidebar-section-label">ACOMPANHAMENTO</div><nav className="side-nav">{navItems.map((item) => <button key={item.label} type="button" title={item.label} onClick={() => navigateFromSidebar(item.path!)} className={`side-link ${active === item.label ? 'active' : ''}`}><item.icon size={17} /><span>{item.label}</span></button>)}</nav>
    <div className="sidebar-spacer" /><button className="sidebar-help" type="button" onClick={() => setHelpOpen(true)}><span className="help-icon"><HelpCircle size={17} /></span><span><b>Precisa de ajuda?</b><small>Veja como acompanhar</small></span><ArrowRight size={15} /></button>
    <Link to="/configuracoes" className={`side-link side-bottom ${active === 'Configurações' ? 'active' : ''}`}><Settings size={17} /><span>Configurações</span></Link><button className="side-link side-bottom" onClick={logout}><LogOut size={17} /><span>Sair</span></button>
    <div className="sidebar-user"><span className="avatar avatar-small">{user.name.slice(0, 1).toUpperCase()}</span><span className="sidebar-user-label"><b>{user.demo ? 'Demonstração' : user.name.split(' ')[0]}</b><small>{user.demo ? 'Dados fictícios' : 'Conta Fênix'}</small></span></div>
  </aside>
  {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
  <main className="main-area"><header className="topbar"><button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((collapsed) => { const next = !collapsed; localStorage.setItem('fenix-sidebar-collapsed', String(next)); return next; })} aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'} title={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button><button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb"><span>Fênix Painel</span><span>/</span>{breadcrumbs ?? <b>{active}</b>}</div><div className="top-actions"><span className={`connection-chip ${user.demo ? 'demo-chip' : ''} ${fenixSync.status === 'running' ? 'syncing-chip' : ''}`} title={user.demo ? 'Ambiente de demonstração' : lastSyncTitle ? `Última atualização: ${lastSyncTitle}${fenixSync.message ? ` · ${fenixSync.message}` : ''}` : fenixSync.message || 'Ainda não houve atualização'}><span className="connection-dot" /> {connectionLabel}{!user.demo && <small className="connection-last-update">{lastSyncDate ? `Última: ${lastSyncDate}` : 'Sem atualização'}</small>}{fenixSync.status === 'running' && fenixSync.total ? <small>{fenixSync.processed}/{fenixSync.total}{fenixSync.requestQueue?.queued ? ` · fila ${fenixSync.requestQueue.queued}` : ''}</small> : null}</span>{onOpenAi && <button className="button button-ai-min global-ai-button" onClick={onOpenAi} aria-label="Abrir assistente de IA"><Sparkles size={15} /><span>Assistente IA</span></button>}<NotificationCenter onActivate={onNotification} /></div></header>
    {user.demo && <div className="demo-banner"><Eye size={14} /><span>Você está vendo dados fictícios de demonstração. Nenhuma informação real do Fênix está sendo exibida.</span><Link to="/entrar">Entrar com Fênix <ArrowRight size={13} /></Link></div>}
    {children}</main>
    {helpOpen && <div className="help-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setHelpOpen(false)}><section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title"><header><div><span className="help-icon"><HelpCircle size={20} /></span><div><h2 id="help-title">Como acompanhar processos</h2><p>Um guia rápido para usar o Fênix Painel.</p></div></div><button className="icon-button" onClick={() => setHelpOpen(false)} aria-label="Fechar ajuda"><X size={18} /></button></header><div className="help-content"><section><b>1. Comece pela edificação</b><p>Abra uma edificação para ver seus protocolos, etapa atual, histórico e documentos consultados no Fênix.</p></section><section><b>2. Entenda os indicadores</b><p>Os cartões mostram processos. Clique em um para abrir a lista correspondente; cada linha leva à ficha da edificação.</p></section><section><b>3. Atualize e confira mudanças</b><p>A frequência é definida em Configurações; use 0 para desativar consultas automáticas. Mudanças encontradas aparecem na campainha.</p></section><section><b>4. Use a IA como apoio</b><p>Na ficha, pergunte sobre o status, as movimentações ou os documentos. Confirme decisões e exigências no Fênix.</p></section></div><footer><button className="button button-outline" onClick={() => { setHelpOpen(false); navigateFromSidebar('/painel?view=sync'); }}>Ver consultas e sincronizações <ArrowRight size={15} /></button></footer></section></div>}
  </div>;
}

function NotificationCenter({ onActivate }: { onActivate?: (notification: UserNotification) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => 'Notification' in window ? Notification.permission : 'unsupported');
  const notificationRef = useRef<HTMLDivElement>(null);
  const knownIds = useRef<Set<number> | null>(null);
  async function loadNotifications() {
    try {
      const response = await api<{ notifications: UserNotification[]; unreadCount: number }>('/api/notifications');
      const newItems = knownIds.current ? response.notifications.filter((item) => !knownIds.current!.has(item.id)) : [];
      if (knownIds.current && permission === 'granted') for (const item of newItems) {
        try {
          const notice = new Notification(item.title, { body: item.message, tag: `fenix-${item.id}` });
          notice.onclick = () => window.focus();
        } catch { /* the saved in-app notification remains available */ }
      }
      knownIds.current = new Set(response.notifications.map((item) => item.id));
      setItems(response.notifications); setUnreadCount(response.unreadCount);
    } catch { /* notification polling must not interrupt dashboard use */ }
  }
  useEffect(() => { void loadNotifications(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void loadNotifications(); }, 45_000); return () => window.clearInterval(timer); }, [permission]);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !notificationRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  async function markAllRead() { await api('/api/notifications/read-all', { method: 'POST' }); await loadNotifications(); }
  async function select(item: UserNotification) {
    if (!item.readAt) await api(`/api/notifications/${item.id}/read`, { method: 'POST' });
    setOpen(false); await loadNotifications(); onActivate?.(item);
  }
  return <div className="notification-wrap" ref={notificationRef}><button className="icon-button notification-button" title="Notificações" aria-label={`Notificações${unreadCount ? `, ${unreadCount} não lidas` : ''}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); void loadNotifications(); }}><Bell size={18} />{unreadCount > 0 && <i />}</button>{open && <section className="notification-popover" aria-label="Notificações"><header><div><b>Notificações</b><small>{unreadCount ? `${unreadCount} não lidas` : 'Tudo em dia'}</small></div>{unreadCount > 0 && <button onClick={() => void markAllRead()}><CheckCheck size={14} /> Marcar como lidas</button>}</header>{permission !== 'granted' && permission !== 'unsupported' && <div className="notification-permission"><span>Receba um aviso do computador quando novos dados chegarem. O painel precisa estar aberto.</span><button onClick={async () => { const next = await Notification.requestPermission(); setPermission(next); }}>Ativar avisos</button></div>}{permission === 'denied' && <div className="notification-permission">Avisos do navegador bloqueados. Você ainda pode acompanhar as mudanças nesta campainha.</div>}{permission === 'unsupported' && <div className="notification-permission">Avisos do computador não estão disponíveis neste navegador; as mudanças ficam salvas nesta campainha.</div>}<div className="notification-list">{items.length ? items.map((item) => <button key={item.id} className={`notification-item ${item.readAt ? '' : 'unread'}`} onClick={() => void select(item)}><span className="notification-item-icon"><Bell size={15} /></span><span><b>{item.title}</b>{item.sourceAccountName && <AccountSourceBadge name={item.sourceAccountName} paused={item.sourceAccountPaused} />}<small>{item.message}</small><time>{formatDate(item.createdAt)}</time></span></button>) : <p className="notification-empty">Nenhuma alteração encontrada nas últimas sincronizações.</p>}</div></section>}</div>;
}

function useDashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try { const result = await api<Dashboard>('/api/dashboard'); setData(result); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível abrir o painel.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void api<Dashboard>('/api/dashboard').then(setData).catch(() => undefined);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (data?.historyRefresh.status !== 'running') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void api<Dashboard>('/api/dashboard').then(setData).catch(() => undefined);
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [data?.historyRefresh.status]);
  return { data, error, loading, refresh };
}

function StatusPill({ status }: { status: string }) {
  const tone = statusTone(status);
  return <span className={`status-pill ${tone}`}><i />{status}</span>;
}

function AccountSourceBadge({ name, paused }: { name?: string | null; paused?: boolean }) {
  if (!name) return null;
  return <small className={`account-source-badge ${paused ? 'paused' : ''}`} title={`${name}${paused ? ' · acompanhamento pausado' : ''}`}><Cloud size={11} />{name}{paused ? ' · pausada' : ''}</small>;
}

function MetricCard({ label, value, trend, trendTone, trendPlain, icon: Icon, tone, onClick }: { label: string; value: number | string; trend?: string; trendTone?: string; trendPlain?: boolean; icon: typeof Building2; tone: string; onClick?: () => void }) {
  const content = <><span className={`metric-icon ${tone}`}><Icon size={19} /></span><span className="metric-copy"><small>{label}</small><b>{value}</b>{trend && <span className={`metric-trend ${trendTone || ''} ${trendPlain ? 'metric-trend-plain' : ''}`}>{!trendPlain && <Activity size={12} />} {trend}</span>}</span>{onClick && <span className="metric-go"><ArrowRight size={15} /></span>}</>;
  return onClick ? <button className="metric-card" onClick={onClick}>{content}</button> : <div className="metric-card metric-card-static">{content}</div>;
}

function dateKeyInBahia(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const datePart = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
}

type BuildingSearchField = 'all' | 'reference' | 'municipality' | 'area' | 'protocol' | 'type' | 'status' | 'stage' | 'account';
type BuildingSearchFilter = { id: string; field: BuildingSearchField; value: string; label: string; accountId?: string };

const buildingSearchFields: Array<{ key: BuildingSearchField; label: string }> = [
  { key: 'reference', label: 'Edificação / referência' }, { key: 'municipality', label: 'Município' },
  { key: 'area', label: 'Área' }, { key: 'protocol', label: 'Processo / protocolo' },
  { key: 'type', label: 'Tipo de processo' }, { key: 'status', label: 'Situação' },
  { key: 'stage', label: 'Etapa atual' }, { key: 'account', label: 'Conta Fênix' },
];

function normalizedFilterText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

function buildingFilterLabel(field: BuildingSearchField) {
  return field === 'all' ? 'Todos os campos' : buildingSearchFields.find((option) => option.key === field)?.label || 'Campo';
}

function matchesBuildingSearchFilter(item: Building, filter: BuildingSearchFilter) {
  if (filter.field === 'account' && filter.accountId) {
    return filter.accountId === 'primary' ? !item.sourceConnectionId : item.sourceConnectionId === filter.accountId;
  }
  const values: Record<BuildingSearchField, string> = {
    all: `${item.reference} ${item.municipality} ${item.address} ${item.area ?? ''} ${formatArea(item.area)} ${item.floors ?? ''} ${item.protocol} ${item.processType} ${item.status} ${item.stage} ${item.sourceAccountName || 'Conta principal'}`,
    reference: item.reference,
    municipality: item.municipality,
    area: `${item.area ?? ''} ${formatArea(item.area)}`,
    protocol: item.protocol,
    type: item.processType,
    status: item.status,
    stage: item.stage,
    account: item.sourceAccountName || 'Conta principal',
  };
  return normalizedFilterText(values[filter.field]).includes(normalizedFilterText(filter.value));
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKeyFromDate(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function shiftDateKey(value: string, days: number) {
  const date = dateFromKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDate(date);
}

function formatPickerDate(value: string, includeYear = true) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', ...(includeYear ? { year: 'numeric' } : {}), timeZone: 'UTC' }).format(dateFromKey(value)).replace(/\.$/, '');
}

function useAnchoredPopover<T extends HTMLElement>(open: boolean, close: () => void, width: number, alignment: 'start' | 'end' = 'start') {
  const anchorRef = useRef<T>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  closeRef.current = close;
  useEffect(() => {
    if (!open) { setPosition(null); return; }
    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const panelWidth = Math.min(width, Math.max(0, window.innerWidth - 24));
      const panelHeight = popoverRef.current?.getBoundingClientRect().height || Math.min(500, window.innerHeight - 24);
      const left = Math.max(12, Math.min(alignment === 'end' ? rect.right - panelWidth : rect.left, window.innerWidth - panelWidth - 12));
      let top = rect.bottom + 8;
      if (top + panelHeight > window.innerHeight - 12 && rect.top - panelHeight - 8 >= 12) top = rect.top - panelHeight - 8;
      else top = Math.min(top, Math.max(12, window.innerHeight - panelHeight - 12));
      setPosition({ top, left, width: panelWidth });
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !popoverRef.current?.contains(target)) closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeRef.current(); };
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, width, alignment]);
  return { anchorRef, popoverRef, position };
}

function BuildingFilterSearch({ filters, sourceAccounts, inputRef, onAdd, onRemove }: {
  filters: BuildingSearchFilter[]; sourceAccounts: Array<{ id: string; label: string }>;
  inputRef: RefObject<HTMLInputElement | null>; onAdd: (filter: BuildingSearchFilter) => void; onRemove: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { anchorRef, popoverRef, position } = useAnchoredPopover<HTMLDivElement>(open, () => setOpen(false), 470);
  const value = query.trim();
  const availableAccounts = [{ id: 'primary', label: 'Conta principal' }, ...sourceAccounts];
  const addFilter = (field: BuildingSearchField, account?: { id: string; label: string }) => {
    const filterValue = account?.label || value;
    if (!filterValue) return;
    onAdd({ id: crypto.randomUUID(), field, value: filterValue, label: `${buildingFilterLabel(field)}: ${filterValue}`, ...(account ? { accountId: account.id } : {}) });
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };
  const suggestions = value ? [
    { field: 'all' as const, label: 'Todos os campos', detail: `Buscar “${value}” em todos os campos` },
    ...buildingSearchFields.map(({ key, label }) => ({ field: key, label, detail: `Buscar “${value}” em ${label.toLocaleLowerCase('pt-BR')}` })),
  ] : [];
  return <>
    <div className="search-box building-filter-search" ref={anchorRef}>
      <Search size={15} aria-hidden="true" />
      <div className="building-filter-chips" aria-label="Filtros ativos">
        {filters.map((filter) => <span className="building-filter-chip" key={filter.id} title={filter.label}><span>{filter.label}</span><button type="button" aria-label={`Remover filtro ${filter.label}`} onClick={() => onRemove(filter.id)}><X size={12} /></button></span>)}
      </div>
      <input ref={inputRef} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === 'Enter' && suggestions.length) { event.preventDefault(); addFilter(suggestions[0].field); } }} placeholder={filters.length ? 'Adicionar filtro…' : 'Buscar por edificação, município, processo…'} aria-label="Pesquisar ou adicionar um filtro" aria-expanded={open} aria-controls="building-filter-suggestions" />
      <kbd>⌘ K</kbd>
    </div>
    {open && position && createPortal(<div id="building-filter-suggestions" className="building-filter-suggestions" ref={popoverRef} role="listbox" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}>
      {value ? <>
        <div className="filter-suggestion-heading">BUSCAR {value.toLocaleUpperCase('pt-BR')}</div>
        {suggestions.map((suggestion, index) => <button type="button" role="option" aria-selected="false" className={`filter-suggestion-option ${index === 0 ? 'primary' : ''}`} key={suggestion.field} onMouseDown={(event) => event.preventDefault()} onClick={() => addFilter(suggestion.field)}><span className="filter-suggestion-icon"><Search size={14} /></span><span><b>{suggestion.label}</b><small>{suggestion.detail}</small></span></button>)}
        {availableAccounts.filter((account) => normalizedFilterText(account.label).includes(normalizedFilterText(value))).map((account) => <button type="button" role="option" aria-selected="false" className="filter-suggestion-option" key={account.id} onMouseDown={(event) => event.preventDefault()} onClick={() => addFilter('account', account)}><span className="filter-suggestion-icon"><Cloud size={14} /></span><span><b>Conta Fênix: {account.label}</b><small>Filtrar apenas esta conta</small></span></button>)}
      </> : <>
        <div className="filter-suggestion-heading">PESQUISA E FILTROS</div>
        <p className="filter-suggestion-hint">Digite um valor para escolher em qual campo pesquisar.</p>
        <div className="filter-suggestion-heading filter-suggestion-subheading">CONTAS FÊNIX</div>{availableAccounts.map((account) => <button type="button" role="option" aria-selected="false" className="filter-suggestion-option" key={account.id} onMouseDown={(event) => event.preventDefault()} onClick={() => addFilter('account', account)}><span className="filter-suggestion-icon"><Cloud size={14} /></span><span><b>{account.label}</b><small>Mostrar edificações desta conta</small></span></button>)}
      </>}
    </div>, document.body)}
  </>;
}

function DateRangePicker({ from, to, onApply, label = 'Período' }: { from: string; to: string; onApply: (from: string, to: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const today = dateKeyInBahia(new Date().toISOString());
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [visibleMonth, setVisibleMonth] = useState(`${(from || today).slice(0, 7)}-01`);
  const { anchorRef, popoverRef, position } = useAnchoredPopover<HTMLButtonElement>(open, () => setOpen(false), 650, 'end');
  useEffect(() => {
    if (!open) return;
    setDraftFrom(from); setDraftTo(to); setVisibleMonth(`${(from || today).slice(0, 7)}-01`);
  }, [open, from, to, today]);
  const choosePreset = (preset: string) => {
    if (preset === 'all') { setDraftFrom(''); setDraftTo(''); return; }
    let nextFrom = today; let nextTo = today;
    if (preset === 'yesterday') nextFrom = nextTo = shiftDateKey(today, -1);
    if (preset === '7days') nextFrom = shiftDateKey(today, -6);
    if (preset === '30days') nextFrom = shiftDateKey(today, -29);
    if (preset === 'thisMonth') nextFrom = `${today.slice(0, 7)}-01`;
    if (preset === 'lastMonth') {
      const current = dateFromKey(`${today.slice(0, 7)}-01`);
      const previousStart = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 1, 1));
      nextFrom = dateKeyFromDate(previousStart);
      nextTo = shiftDateKey(`${today.slice(0, 7)}-01`, -1);
    }
    setDraftFrom(nextFrom); setDraftTo(nextTo); setVisibleMonth(`${nextFrom.slice(0, 7)}-01`);
  };
  const selectDay = (day: string) => {
    if (!draftFrom || draftTo) { setDraftFrom(day); setDraftTo(''); return; }
    if (day < draftFrom) { setDraftTo(draftFrom); setDraftFrom(day); }
    else setDraftTo(day);
  };
  const monthDate = dateFromKey(visibleMonth);
  const year = monthDate.getUTCFullYear(); const monthIndex = monthDate.getUTCMonth();
  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(monthDate);
  const monthHeading = `${monthLabel.charAt(0).toLocaleUpperCase('pt-BR')}${monthLabel.slice(1)}`;
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const calendarDays = Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
  });
  const title = !from && !to ? 'Todo o período' : from && to && from === to ? formatPickerDate(from) : `${formatPickerDate(from, false)} – ${formatPickerDate(to || from)}`;
  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, monthIndex + delta, 1));
    setVisibleMonth(dateKeyFromDate(next));
  };
  return <>
    <button ref={anchorRef} type="button" className="period-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="dialog" aria-expanded={open}><CalendarDays size={15} /><span><small>{label}</small><b>{title}</b></span><ChevronRight size={14} className="period-trigger-chevron" /></button>
    {open && position && createPortal(<div className="period-picker-popover" ref={popoverRef} role="dialog" aria-label="Selecionar período" style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}>
      <header className="period-picker-header"><div><b>Selecionar período</b><small>Escolha uma opção rápida ou monte um intervalo.</small></div><button type="button" aria-label="Fechar seletor de período" onClick={() => setOpen(false)}><X size={16} /></button></header>
      <div className="period-picker-body">
        <nav className="period-presets" aria-label="Períodos predefinidos">{[
          ['today', 'Hoje'], ['yesterday', 'Ontem'], ['7days', 'Últimos 7 dias'], ['30days', 'Últimos 30 dias'], ['thisMonth', 'Este mês'], ['lastMonth', 'Mês passado'], ['all', 'Todo o período'],
        ].map(([key, text]) => <button type="button" key={key} className={key === 'all' && !draftFrom && !draftTo ? 'selected' : ''} onClick={() => choosePreset(key)}>{text}</button>)}</nav>
        <div className="period-calendar">
          <div className="period-calendar-heading"><button type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></button><b>{monthHeading}</b><button type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)}><ChevronRight size={17} /></button></div>
          <div className="period-range-summary"><span><small>Início</small><b>{draftFrom ? formatPickerDate(draftFrom) : 'Selecione'}</b></span><span className="period-range-dash">—</span><span><small>Término</small><b>{draftTo ? formatPickerDate(draftTo) : 'Selecione'}</b></span></div>
          <div className="period-calendar-grid period-weekdays">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
          <div className="period-calendar-grid">{calendarDays.map((day, index) => {
            if (!day) return <span className="period-calendar-empty" key={`empty-${index}`} />;
            const selected = day === draftFrom || day === draftTo;
            const inRange = Boolean(draftFrom && draftTo && day > draftFrom && day < draftTo);
            return <button type="button" key={day} className={`${selected ? 'selected' : ''} ${inRange ? 'in-range' : ''} ${day === today ? 'today' : ''}`} aria-pressed={selected} onClick={() => selectDay(day)}>{Number(day.slice(-2))}</button>;
          })}</div>
          <small className="period-calendar-help">Selecione a data inicial e depois a final.</small>
        </div>
      </div>
      <footer className="period-picker-footer"><button type="button" className="text-link" onClick={() => { setDraftFrom(''); setDraftTo(''); }}>Limpar período</button><div><button type="button" className="button button-outline" onClick={() => setOpen(false)}>Cancelar</button><button type="button" className="button button-teal" onClick={() => { const start = draftFrom; const end = draftTo || draftFrom; onApply(start, end); setOpen(false); }}>Aplicar</button></div></footer>
    </div>, document.body)}
  </>;
}

function ProcessWorkspace({ view, processes, buildings, sourceAccounts, historyRefreshStatus, processMenuFilters, searchInputRef, onOpen, onAsk }: {
  view: string; processes: DashboardProcess[]; buildings: Building[]; sourceAccounts: Array<{ id: string; label: string }>; historyRefreshStatus: string; processMenuFilters: ProcessMenuFilters; searchInputRef: RefObject<HTMLInputElement | null>;
  onOpen: (building: Building, tab?: string, processId?: string) => void; onAsk: (building: Building, prompt?: string) => void;
}) {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState(new URLSearchParams(location.search).get('filter') || 'all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [appliedDateFrom, setAppliedDateFrom] = useState('');
  const [appliedDateTo, setAppliedDateTo] = useState('');
  useEffect(() => { setScope(new URLSearchParams(location.search).get('filter') || 'all'); setQuery(''); setAppliedDateFrom(''); setAppliedDateTo(''); }, [view, location.search]);
  const title = view === 'projects' ? 'Projetos (ACP)' : view === 'analysis' ? 'Em Análise' : view === 'notified' ? 'Notificados' : view === 'stopped' ? 'Parados' : view === 'certificates' ? 'AVCBs e CLCBs' : 'Processos';
  const menuFilterKey = (['projects', 'analysis', 'notified', 'stopped', 'certificates'].includes(view) ? view : null) as ProcessMenuKey | null;
  const matchingView = processes.filter((item) => {
    if (sourceFilter === 'primary' && item.sourceConnectionId) return false;
    if (sourceFilter !== 'all' && sourceFilter !== 'primary' && item.sourceConnectionId !== sourceFilter) return false;
    const category = `${item.type} ${item.status} ${item.stage}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const status = `${item.status} ${item.stage}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (menuFilterKey && !matchesProcessMenuFilter(item, processMenuFilters[menuFilterKey] || DEFAULT_PROCESS_MENU_FILTERS[menuFilterKey])) return false;
    if (view === 'projects' && scope === 'analysis' && !/analise/.test(status)) return false;
    if (view === 'projects' && scope === 'notified' && !/notific/.test(status)) return false;
    if (view === 'projects' && scope === 'approved' && !/aprov|homolog|certific/.test(status)) return false;
    if (view === 'stopped' && scope === 'stopped:draft' && !/rascunho de protocolo/.test(status)) return false;
    if (view === 'stopped' && scope === 'stopped:documentation' && !/pendente de documentacao/.test(status)) return false;
    if (view === 'stopped' && scope === 'stopped:forwarding' && !/pendente de encaminhamento/.test(status)) return false;
    if (scope.startsWith('type:') && !category.includes(scope.slice(5).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())) return false;
    if (scope === 'approved:avcb' && !(/avcb/.test(category) && /aprov|homolog|certific/.test(status))) return false;
    if (scope === 'approved:clcb' && !(/clcb/.test(category) && /aprov|homolog|certific/.test(status))) return false;
    if (scope === 'in-progress:certificates' && !(/avcb|clcb/.test(category) && !/aprov|homolog|certific/.test(status))) return false;
    if (scope.startsWith('process:') && item.id !== scope.slice('process:'.length)) return false;
    const dateValue = view === 'analysis' ? item.analysisEnteredAt : view === 'notified' ? item.notificationEnteredAt : item.latestActivityAt;
    const dateKey = dateKeyInBahia(dateValue);
    if ((appliedDateFrom || appliedDateTo) && (!dateKey || (appliedDateFrom && dateKey < appliedDateFrom) || (appliedDateTo && dateKey > appliedDateTo))) return false;
    if (scope === 'attention' && !/pend|exig|document|retific|notific/.test(status)) return false;
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    return !needle || `${item.buildingReference} ${item.municipality} ${item.protocol} ${item.type} ${item.status} ${item.stage}`.toLocaleLowerCase('pt-BR').includes(needle);
  });
  const tabs: string[][] = [];
  const pageSize = 12;
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, scope, sourceFilter, view, appliedDateFrom, appliedDateTo]);
  const pageCount = Math.max(1, Math.ceil(matchingView.length / pageSize));
  const pageRows = matchingView.slice((page - 1) * pageSize, page * pageSize);
  const buildingsById = new Map(buildings.map((building) => [building.id, building]));
  const exportRows: ExcelCell[][] = matchingView.map((item) => {
    const dateValue = view === 'analysis' ? item.analysisEnteredAt : view === 'notified' ? item.notificationEnteredAt : item.latestActivityAt;
    return [item.sourceAccountName || 'Conta principal', item.buildingReference, item.municipality, item.protocol, item.type, item.status, item.stage, item.documentCount, formatDate(dateValue)];
  });
  const intro = view === 'projects' ? 'Projetos técnicos PT e PTS vinculados às edificações acompanhadas.'
    : view === 'analysis' ? 'Processos com etapa atual em análise pelo Corpo de Bombeiros.'
    : view === 'notified' ? 'Processos com notificação registrada; abra a edificação para consultar documentos e histórico.'
    : view === 'stopped' ? 'Processos sem avanço nas etapas Rascunho de Protocolo, Pendente de Documentação ou Pendente de Encaminhamento.'
    : view === 'certificates' ? 'Edificações com processo homologado ou certificado de aprovação.'
    : 'Os indicadores e esta lista usam a mesma unidade: processos do Fênix.';
  return <section className="building-section process-workspace">
    <div className="section-title-row"><div><h2>{title} <span>{matchingView.length}</span></h2><p>{intro}</p></div><ExcelExportButton filename={`fenix-${title}`} sheetName={title} columns={['Conta Fênix', 'Edificação', 'Município', 'Protocolo', 'Tipo de processo', 'Status', 'Etapa atual', 'Documentos sincronizados', view === 'analysis' ? 'Entrada em análise' : view === 'notified' ? 'Data da notificação' : 'Última atualização']} rows={exportRows} /></div>
    <div className="table-toolbar process-toolbar"><div className="process-date-filters"><DateRangePicker from={appliedDateFrom} to={appliedDateTo} onApply={(from, to) => { setAppliedDateFrom(from); setAppliedDateTo(to); }} label="Atividade" />{(appliedDateFrom || appliedDateTo) && <button className="text-link" onClick={() => { setAppliedDateFrom(''); setAppliedDateTo(''); }}>Limpar datas</button>}{sourceAccounts.length > 0 && <label className="source-filter-label">Conta<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todas</option><option value="primary">Conta principal</option>{sourceAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>}</div><label className="search-box"><Search size={15} /><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar edificação, município ou protocolo..." /><kbd>⌘ K</kbd></label></div>
    <div className="table-wrap"><table className="process-table"><thead><tr><th>EDIFICAÇÃO</th><th>PROCESSO / PROTOCOLO</th><th>ETAPA</th><th>DOCUMENTOS</th><th>{view === 'analysis' ? 'ENTRADA EM ANÁLISE' : view === 'notified' ? 'DATA DA NOTIFICAÇÃO' : 'ÚLTIMA ATUALIZAÇÃO'}</th><th></th></tr></thead><tbody>{pageRows.map((item) => {
      const building = buildingsById.get(item.buildingId);
      const dateValue = view === 'analysis' ? item.analysisEnteredAt : view === 'notified' ? item.notificationEnteredAt : item.latestActivityAt;
      return <tr key={item.id} className="clickable-row" onClick={() => building && onOpen(building, view === 'documents' ? 'Documentos' : undefined, item.id)}>
        <td><span className="building-cell"><span className="building-thumb"><Building2 size={17} /></span><span><b>{item.buildingReference}</b><small>{item.municipality || 'Município não informado'}</small><AccountSourceBadge name={item.sourceAccountName} paused={item.sourceAccountPaused} /></span></span></td>
        <td><b className="protocol-text">{item.protocol || 'Protocolo não informado'}</b><small className="table-subtext">{item.type}</small></td>
        <td><StatusPill status={item.stage || item.status} /><small className="table-subtext">{item.status}</small></td>
        <td><span className={item.documentCount ? 'document-count' : 'document-count document-count-muted'}>{item.documentCount ? `${item.documentCount} anexo${item.documentCount === 1 ? '' : 's'} sincronizado${item.documentCount === 1 ? '' : 's'}` : 'Consultar no Fênix ao abrir'}</span></td>
        <td><span className="sync-time">{formatDate(dateValue) === '—' && historyRefreshStatus === 'running' ? 'Atualizando histórico…' : formatDate(dateValue)}</span></td>
        <td><div className="row-actions"><button className="ai-row-button" title="Entender processo com IA" aria-label={`Entender ${item.protocol} com IA`} onClick={(event) => { event.stopPropagation(); if (building) onAsk(building, `Explique a situação atual do processo ${item.protocol}, incluindo a etapa, as pendências e o próximo passo recomendado com base nos dados disponíveis.`); }}><Sparkles size={15} /></button><button className="row-open" aria-label="Abrir processo" onClick={(event) => { event.stopPropagation(); if (building) onOpen(building, view === 'documents' ? 'Documentos' : undefined, item.id); }}><ArrowRight size={15} /></button></div></td>
      </tr>;
    })}{!pageRows.length && <tr><td colSpan={6} className="empty-row"><Search size={20} /><b>Nenhum processo encontrado</b><span>Ajuste a busca ou escolha outra categoria.</span></td></tr>}</tbody></table></div>
    <div className="table-foot"><span>{matchingView.length} processo{matchingView.length === 1 ? '' : 's'} · {view === 'documents' ? 'documentos oficiais carregam ao abrir a edificação' : 'origem: processos sincronizados do Fênix'}</span><div className="table-pagination"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Anterior</button><span>{page} / {pageCount}</span><button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Próxima</button></div></div>
  </section>;
}

function RenewalsWorkspace({ records, sourceAccounts, list, onListChange, windowMonths, onWindowChange, onSaveWindow, savingWindow, error, updatingId, onDisposition, onOpen }: {
  records: RenewalRecord[]; list: 'active' | 'archived'; onListChange: (list: 'active' | 'archived') => void;
  sourceAccounts: Array<{ id: string; label: string }>;
  windowMonths: number; onWindowChange: (months: number) => void; onSaveWindow: () => void; savingWindow: boolean;
  error: string; updatingId: string; onDisposition: (item: RenewalRecord, disposition: 'archived' | 'lost' | 'active') => void;
  onOpen: (buildingId: string, processId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [situation, setSituation] = useState('all');
  const [month, setMonth] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  useEffect(() => { setSearch(''); setSourceFilter('all'); setSituation('all'); setMonth('all'); setDateFrom(''); setDateTo(''); }, [list]);
  const dateLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Bahia' }).format(new Date(value));
  const dispositionLabel = (item: RenewalRecord) => item.disposition === 'lost' ? 'Perdido' : item.disposition === 'archived' ? 'Arquivado' : item.severity === 'overdue' ? `Vencido há ${Math.abs(item.daysUntilRenewal)} dia${Math.abs(item.daysUntilRenewal) === 1 ? '' : 's'}` : item.severity === 'urgent' ? 'No limite' : item.severity === 'attention' ? 'Prazo próximo' : 'Dentro do prazo';
  const badgeClass = (item: RenewalRecord) => item.disposition === 'lost' ? 'lost-state' : item.disposition === 'archived' ? 'archived-state' : item.severity;
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const filteredRecords = records.filter((item) => {
    const renewalDate = dateKeyInBahia(item.renewalAt);
    const text = normalize(`${item.buildingReference} ${item.municipality} ${item.sourceAccountName || ''} ${item.protocol} ${item.type} ${item.status} ${item.stage} ${dispositionLabel(item)}`);
    const matchesSearch = !search.trim() || text.includes(normalize(search.trim()));
    const matchesSource = sourceFilter === 'all' || (sourceFilter === 'primary' ? !item.sourceConnectionId : item.sourceConnectionId === sourceFilter);
    const matchesSituation = situation === 'all' || (situation === 'lost' ? item.disposition === 'lost' : situation === 'archived' ? item.disposition === 'archived' : item.severity === situation);
    const matchesMonth = month === 'all' || renewalDate.slice(5, 7) === month;
    const matchesDate = (!dateFrom || (renewalDate && renewalDate >= dateFrom)) && (!dateTo || (renewalDate && renewalDate <= dateTo));
    return matchesSearch && matchesSource && matchesSituation && matchesMonth && matchesDate;
  });
  const hasFilters = Boolean(search || sourceFilter !== 'all' || situation !== 'all' || month !== 'all' || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setSourceFilter('all'); setSituation('all'); setMonth('all'); setDateFrom(''); setDateTo(''); };
  const exportRows: ExcelCell[][] = filteredRecords.map((item) => [item.sourceAccountName || 'Conta principal', item.buildingReference, item.municipality, item.protocol, item.type, item.status, item.stage, dateLabel(item.homologatedAt), dateLabel(item.renewalAt), dispositionLabel(item)]);
  const exportColumns = ['Conta Fênix', 'Edificação', 'Município', 'Protocolo', 'Tipo', 'Status', 'Etapa', 'Homologado em', 'Renovação em', 'Situação'];
  return <section className="renewal-section">
    <div className="section-title-row">
      <div><h2>{list === 'active' ? 'Renovações a acompanhar' : 'Arquivados e perdidos'} <span>{records.length}</span></h2><p>{list === 'active' ? 'Certificados dentro da janela configurada, com base na homologação do Fênix.' : 'Itens guardados ou marcados como perdidos; eles não aparecem na lista ativa.'}</p></div>
      <div className="renewal-window-control"><label>Exibir próximos <input type="number" min="1" max="24" value={windowMonths} disabled={list === 'archived'} onChange={(event) => onWindowChange(Number(event.target.value))} /> meses</label><button className="button button-outline" disabled={savingWindow || list === 'archived' || windowMonths < 1 || windowMonths > 24} onClick={onSaveWindow}>{savingWindow ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Salvar</button><ExcelExportButton filename={`fenix-renovacoes-${list}`} sheetName={list === 'active' ? 'Renovações' : 'Arquivados'} columns={exportColumns} rows={exportRows} /><button className="button button-outline renewal-toggle" onClick={() => onListChange(list === 'active' ? 'archived' : 'active')}>{list === 'active' ? <><Archive size={14} /> Arquivados</> : <><CalendarClock size={14} /> Renovar</>}</button></div>
    </div>
    {error && <div className="settings-message error">{error}</div>}
    {list === 'active' && <ul className="renewal-legend"><li><i className="normal" /> <b>Verde:</b> Dentro do prazo (Normal/Seguro)</li><li><i className="attention" /> <b>Amarelo/Laranja:</b> Prazo próximo (Atenção)</li><li><i className="urgent" /> <b>Vermelho:</b> No limite do prazo (Alerta/Urgência)</li><li><i className="overdue" /> <b>Preto ou Roxo:</b> Prazo perdido (Vencido)</li></ul>}
    <div className="table-toolbar renewal-filters"><div className="renewal-filter-controls"><DateRangePicker from={dateFrom} to={dateTo} onApply={(from, to) => { setDateFrom(from); setDateTo(to); }} label="Renovação" /><label>Situação<select value={situation} onChange={(event) => setSituation(event.target.value)}><option value="all">Todas</option>{list === 'active' ? <><option value="normal">Dentro do prazo</option><option value="attention">Prazo próximo</option><option value="urgent">No limite</option><option value="overdue">Vencidas</option></> : <><option value="archived">Arquivados</option><option value="lost">Perdidos</option></>}</select></label><label>Mês<select value={month} onChange={(event) => setMonth(event.target.value)}><option value="all">Todos</option>{Array.from({ length: 12 }, (_, index) => { const value = String(index + 1).padStart(2, '0'); const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, index, 1))); return <option key={value} value={value}>{label}</option>; })}</select></label>{sourceAccounts.length > 0 && <label className="source-filter-label">Conta<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Todas</option><option value="primary">Conta principal</option>{sourceAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label>}{hasFilters && <button className="text-link renewal-clear-filters" onClick={clearFilters}>Limpar filtros</button>}</div><label className="search-box renewal-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar edificação, município ou processo..." aria-label="Buscar renovações" /></label><span className="renewal-result-count">Exibindo {filteredRecords.length} de {records.length}</span></div>
    <div className="table-wrap"><table><thead><tr><th>EDIFICAÇÃO</th><th>MUNICÍPIO</th><th>PROCESSO</th><th>HOMOLOGADO EM</th><th>RENOVAÇÃO EM</th><th>SITUAÇÃO</th><th>AÇÕES</th></tr></thead><tbody>
      {filteredRecords.map((item) => <tr key={item.id} className="clickable-row" onClick={() => onOpen(item.buildingId, item.id)}>
        <td><b>{item.buildingReference}</b><AccountSourceBadge name={item.sourceAccountName} paused={item.sourceAccountPaused} /></td><td>{item.municipality || '—'}</td><td><b className="protocol-text">{item.protocol || 'Sem protocolo'}</b><small className="table-subtext">{item.type}</small></td><td>{dateLabel(item.homologatedAt)}</td><td>{dateLabel(item.renewalAt)}</td>
        <td><span className={`renewal-badge ${badgeClass(item)}`}>{dispositionLabel(item)}</span></td>
        <td><div className="renewal-row-actions" onClick={(event) => event.stopPropagation()}>{list === 'active' ? <><button disabled={Boolean(updatingId)} title="Arquivar renovação" aria-label="Arquivar renovação" onClick={() => onDisposition(item, 'archived')}><Archive size={15} /></button><button disabled={Boolean(updatingId)} title="Marcar como perdido" aria-label="Marcar como perdido" onClick={() => onDisposition(item, 'lost')}><UserX size={15} /></button></> : <><button disabled={Boolean(updatingId)} title="Reativar renovação" aria-label="Reativar renovação" onClick={() => onDisposition(item, 'active')}><RotateCcw size={15} /></button><button disabled={Boolean(updatingId)} title={item.disposition === 'lost' ? 'Mover para arquivados' : 'Marcar como perdido'} aria-label={item.disposition === 'lost' ? 'Mover para arquivados' : 'Marcar como perdido'} onClick={() => onDisposition(item, item.disposition === 'lost' ? 'archived' : 'lost')}>{item.disposition === 'lost' ? <Archive size={15} /> : <UserX size={15} />}</button></>}</div></td>
      </tr>)}
      {!filteredRecords.length && <tr><td colSpan={7} className="empty-row">{records.length ? <><Search size={20} /><b>Nenhum resultado para esses filtros</b><span>Altere a pesquisa, o período, o mês ou a situação.</span></> : <><CalendarClock size={20} /><b>{list === 'active' ? 'Nenhuma renovação na janela' : 'Nenhum item arquivado'}</b><span>{list === 'active' ? 'A lista considera AVCBs e CLCBs homologados com histórico sincronizado.' : 'Ao arquivar ou marcar como perdido, o processo aparecerá aqui.'}</span></>}</td></tr>}
    </tbody></table></div>
  </section>;
}

function DashboardPage() {
  const { data, error, loading, refresh } = useDashboard();
  const location = useLocation();
  const view = new URLSearchParams(location.search).get('view') || 'overview';
  const [filter, setFilter] = useState('Todas');
  const [searchFilters, setSearchFilters] = useState<BuildingSearchFilter[]>([]);
  const [appliedBuildingDateFrom, setAppliedBuildingDateFrom] = useState('');
  const [appliedBuildingDateTo, setAppliedBuildingDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [buildingPageSize, setBuildingPageSize] = useState<number | 'all'>(50);
  const [syncing, setSyncing] = useState(false);
  const [externalSyncRunning, setExternalSyncRunning] = useState(false);
  const [renewals, setRenewals] = useState<RenewalRecord[]>([]);
  const [renewalList, setRenewalList] = useState<'active' | 'archived'>('active');
  const [renewalWindow, setRenewalWindow] = useState(2);
  const [renewalOverdueDays, setRenewalOverdueDays] = useState(60);
  const [renewalError, setRenewalError] = useState('');
  const [savingRenewalWindow, setSavingRenewalWindow] = useState(false);
  const [updatingRenewalId, setUpdatingRenewalId] = useState('');
  const [toast, setToast] = useState('');
  const [selected, setSelected] = useState<Building | null>(null);
  const [selectedTab, setSelectedTab] = useState('Edificação');
  const [selectedProcessId, setSelectedProcessId] = useState<string | undefined>();
  const [connectionModal, setConnectionModal] = useState<{ mode: 'new' | 'manage' | 'reauth'; connection?: FenixConnectionSummary } | null>(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [aiBuilding, setAiBuilding] = useState<Building | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const launchAi = (building: Building | null, prompt = '') => { setAiBuilding(building); setAiPrompt(prompt); setAiOpen(true); };
  const [syncMenu, setSyncMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setPage(1); }, [view, searchFilters, filter, appliedBuildingDateFrom, appliedBuildingDateTo]);
  useEffect(() => {
    if (view !== 'renewals') return;
    let active = true;
    api<{ windowMonths: number; overdueLimitDays: number; renewals: RenewalRecord[] }>(`/api/renewals?view=${renewalList}`).then((result) => { if (active) { setRenewalWindow(result.windowMonths); setRenewalOverdueDays(result.overdueLimitDays); setRenewals(result.renewals); setRenewalError(''); } }).catch((e) => { if (active) setRenewalError(e.message); });
    return () => { active = false; };
  }, [view, renewalList]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);
  const navigate = useNavigate();
  if (loading) return <div className="loading-screen"><LoaderCircle className="spin" size={24} /><span>Preparando seu painel...</span></div>;
  if (!data) return <main className="auth-error"><div className="auth-error-icon"><LockKeyhole /></div><h1>Acesso necessário</h1><p>{error || 'Entre com sua conta Fênix para ver as edificações.'}</p><Link className="button button-teal" to="/entrar">Entrar com Fênix <ArrowRight size={16} /></Link></main>;
  const activeNav = view === 'buildings' ? 'Edificações' : view === 'projects' ? 'Projetos (ACP)' : view === 'analysis' ? 'Em Análise' : view === 'notified' ? 'Notificados' : view === 'stopped' ? 'Parados' : view === 'certificates' ? 'AVCBs e CLCBs' : view === 'renewals' ? 'Renovações' : view === 'sync' ? 'Consultas' : 'Visão geral';
  const viewTitle = view === 'buildings' ? 'Edificações' : view === 'projects' ? 'Projetos (ACP)' : view === 'analysis' ? 'Em Análise' : view === 'notified' ? 'Notificados' : view === 'stopped' ? 'Parados' : view === 'certificates' ? 'AVCBs e CLCBs' : view === 'renewals' ? 'Renovações' : view === 'sync' ? 'Consultas' : 'Visão geral';
  const viewBuildings = data.buildings;
  const visible = viewBuildings.filter((item) => {
    const matchesText = searchFilters.every((searchFilter) => matchesBuildingSearchFilter(item, searchFilter));
    const matchesFilter = filter === 'Todas' || (filter === 'Em análise' && /an[aá]lise/i.test(item.status)) || (filter === 'Aguardando ação' && /pend|exig|document|retific/i.test(item.status)) || (filter === 'Aprovadas' && /aprov|homolog|conclu/i.test(item.status));
    const dateKey = dateKeyInBahia(item.lastUpdated);
    const matchesDate = (!appliedBuildingDateFrom || (dateKey && dateKey >= appliedBuildingDateFrom)) && (!appliedBuildingDateTo || (dateKey && dateKey <= appliedBuildingDateTo));
    return matchesText && matchesFilter && matchesDate;
  });
  const pageSize = buildingPageSize === 'all' ? Math.max(visible.length, 1) : buildingPageSize;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageRows = buildingPageSize === 'all' ? visible : visible.slice((page - 1) * pageSize, page * pageSize);
  const updateInProgress = syncing || externalSyncRunning || data.sync.status === 'running';
  async function syncNow() {
    if (updateInProgress) return;
    setSyncing(true); setSyncMenu(false);
    try { const result = await api<{ partial?: boolean }>('/api/sync/now', { method: 'POST' }); await refresh(); setConnectionRevision((revision) => revision + 1); setToast(result.partial ? 'Atualização parcial. Consulte o estado das contas em Consultas.' : 'Informações sincronizadas.'); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Falha ao sincronizar.'); }
    finally { setSyncing(false); window.setTimeout(() => setToast(''), 4200); }
  }
  const visibleProcessCount = visible.reduce((total, item) => total + item.processCount, 0);
  const buildingExportRows: ExcelCell[][] = visible.map((item) => [item.sourceAccountName || 'Conta principal', item.reference, item.municipality, formatArea(item.area), item.floors, item.protocol, item.processType, item.status, item.stage, formatDate(item.lastUpdated), item.processCount]);
  const processMenuFilters = data.processMenuFilters || DEFAULT_PROCESS_MENU_FILTERS;
  const projectProcesses = data.processes.filter((item) => matchesProcessMenuFilter(item, processMenuFilters.projects));
  const requestProcesses = data.processes.filter((item) => /solicitacao|vistoria/i.test(item.type));
  const notifiedProcesses = data.processes.filter((item) => matchesProcessMenuFilter(item, processMenuFilters.notified));
  const stoppedProcesses = data.processes.filter((item) => matchesProcessMenuFilter(item, processMenuFilters.stopped));
  const approvedProcesses = data.processes.filter((item) => /homolog|aprov|certific/i.test(`${item.status} ${item.stage}`));
  const analysisProcesses = data.processes.filter((item) => matchesProcessMenuFilter(item, processMenuFilters.analysis));
  const attentionProcesses = data.processes.filter((item) => /pend|exig|document|retific|notific/i.test(`${item.status} ${item.stage}`));
  const projectApproved = projectProcesses.filter((item) => /homolog|aprov|certific/i.test(`${item.status} ${item.stage}`));
  const analysisByStageDate = analysisProcesses.filter((item) => item.analysisEnteredAt && Number.isFinite(Date.parse(item.analysisEnteredAt))).sort((a, b) => Date.parse(b.analysisEnteredAt!) - Date.parse(a.analysisEnteredAt!));
  const notifiedByStageDate = notifiedProcesses.filter((item) => item.notificationEnteredAt && Number.isFinite(Date.parse(item.notificationEnteredAt))).sort((a, b) => Date.parse(b.notificationEnteredAt!) - Date.parse(a.notificationEnteredAt!));
  const describeProcess = (item: DashboardProcess) => `${item.buildingReference} · ${item.protocol || 'Sem protocolo'} · ${item.type}`;
  const notificationHistoryCount = notifiedProcesses.filter((item) => item.historyAvailable === true && typeof item.notificationCount === 'number').length;
  const notificationAverage = notificationHistoryCount ? `${(notifiedProcesses.reduce((total, item) => total + (item.notificationCount || 0), 0) / notificationHistoryCount).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por processo` : '—';
  const notificationHistoryCoverage = `${notificationHistoryCount} de ${notifiedProcesses.length} processos com histórico${notificationHistoryCount < notifiedProcesses.length ? ' · média parcial' : ''}`;
  const analysisDays = (item: DashboardProcess) => item.analysisEnteredAt ? Math.max(0, (Date.now() - Date.parse(item.analysisEnteredAt)) / 86_400_000) : null;
  const averageAnalysisDays = (items: DashboardProcess[]) => {
    const durations = items.map(analysisDays).filter((days): days is number => days !== null && Number.isFinite(days));
    if (!durations.length) return { value: '—', coverage: `sem datas válidas no histórico · ${items.length} processos` };
    const average = durations.reduce((sum, days) => sum + days, 0) / durations.length;
    return { value: `${average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${average < 1.05 ? 'dia' : 'dias'}`, coverage: `${durations.length} de ${items.length} processos com histórico` };
  };
  const projectKindOf = (item: DashboardProcess) => (item.projectKind || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR').trim();
  const analysisGroups = [
    { label: 'AVCB', matches: (item: DashboardProcess) => /avcb/i.test(item.type) },
    { label: 'CLCB', matches: (item: DashboardProcess) => /clcb/i.test(item.type) },
    { label: 'PT', matches: (item: DashboardProcess) => projectKindOf(item) ? /^PT(?!S)/.test(projectKindOf(item)) : /\bpt\b/i.test(item.type) && !/pts/i.test(item.type) },
    { label: 'PTS', matches: (item: DashboardProcess) => projectKindOf(item) ? /^PTS/.test(projectKindOf(item)) : /pts/i.test(item.type) }
  ].map((group) => ({ label: group.label, ...averageAnalysisDays(analysisProcesses.filter(group.matches)) }));
  const overallAnalysisAverage = averageAnalysisDays(analysisProcesses);
  const certificateProcesses = data.processes.filter((item) => matchesProcessMenuFilter(item, processMenuFilters.certificates));
  const avcbProcesses = certificateProcesses.filter((item) => /avcb/i.test(item.type));
  const clcbProcesses = certificateProcesses.filter((item) => /clcb/i.test(item.type));
  const inProgressCertificates = certificateProcesses.filter((item) => !/homolog|aprov|certific/i.test(`${item.status} ${item.stage}`));
  async function saveRenewalWindow() {
    setSavingRenewalWindow(true); setRenewalError('');
    try {
      await api('/api/settings/renewals', { method: 'PUT', body: JSON.stringify({ windowMonths: renewalWindow }) });
      const result = await api<{ windowMonths: number; overdueLimitDays: number; renewals: RenewalRecord[] }>(`/api/renewals?view=${renewalList}`);
      setRenewalWindow(result.windowMonths); setRenewalOverdueDays(result.overdueLimitDays); setRenewals(result.renewals);
    } catch (e) { setRenewalError(e instanceof Error ? e.message : 'Não foi possível salvar a janela.'); }
    finally { setSavingRenewalWindow(false); }
  }
  async function updateRenewalDisposition(item: RenewalRecord, disposition: 'archived' | 'lost' | 'active') {
    setUpdatingRenewalId(item.id); setRenewalError('');
    try {
      await api(`/api/renewals/${encodeURIComponent(item.id)}/disposition`, { method: 'PUT', body: JSON.stringify({ disposition }) });
      const result = await api<{ windowMonths: number; overdueLimitDays: number; renewals: RenewalRecord[] }>(`/api/renewals?view=${renewalList}`);
      setRenewals(result.renewals);
    } catch (e) { setRenewalError(e instanceof Error ? e.message : 'Não foi possível atualizar a renovação.'); }
    finally { setUpdatingRenewalId(''); }
  }
  const contextualMetrics = view === 'renewals' ? renewalList === 'archived' ? [
    { label: 'Arquivados e perdidos', value: renewals.length, trend: 'itens nesta lista', icon: Archive, tone: 'teal' },
    { label: 'Marcados como perdidos', value: renewals.filter((item) => item.disposition === 'lost').length, trend: 'fora da carteira ativa', icon: UserX, tone: 'amber' },
    { label: 'Arquivados', value: renewals.filter((item) => item.disposition === 'archived').length, trend: 'fora da carteira ativa', icon: Archive, tone: 'violet' },
    { label: 'Prazo perdido', value: renewals.filter((item) => item.severity === 'overdue').length, trend: 'vencidos nesta lista', icon: CircleAlert, tone: 'blue' }
  ] : [
    { label: 'Dentro do prazo', value: renewals.filter((item) => item.severity === 'normal').length, trend: 'situação normal/segura', icon: ShieldCheck, tone: 'teal' },
    { label: 'Prazo próximo', value: renewals.filter((item) => item.severity === 'attention').length, trend: 'atenção', icon: Clock3, tone: 'amber' },
    { label: 'No limite', value: renewals.filter((item) => item.severity === 'urgent').length, trend: 'alerta máximo/urgência', icon: CircleAlert, tone: 'violet' },
    { label: 'Prazo perdido', value: renewals.filter((item) => item.severity === 'overdue').length, trend: `exibindo até ${renewalOverdueDays} dias vencidos`, icon: CalendarClock, tone: 'blue' }
  ] : view === 'projects' ? [
    { label: 'Projetos PT e PTS', value: projectProcesses.length, trend: 'projetos vinculados', icon: ClipboardList, tone: 'teal', filter: 'all' },
    { label: 'Em análise', value: projectProcesses.filter((item) => /an[aá]lise/i.test(`${item.status} ${item.stage}`)).length, trend: 'projetos no Corpo de Bombeiros', icon: Activity, tone: 'blue', filter: 'analysis' },
    { label: 'Notificados', value: projectProcesses.filter((item) => /notific/i.test(`${item.status} ${item.stage}`)).length, trend: 'projetos com notificação', icon: CircleAlert, tone: 'amber', filter: 'notified' },
    { label: 'Homologados', value: projectApproved.length, trend: 'projetos aprovados', icon: BadgeCheck, tone: 'violet', filter: 'approved' }
  ] : view === 'analysis' ? [
    { label: 'Processos em análise', value: analysisProcesses.length, trend: 'total na base sincronizada', icon: Activity, tone: 'blue', filter: 'all' },
    { label: 'Entrada mais recente em análise', value: analysisByStageDate[0] ? formatDate(analysisByStageDate[0].analysisEnteredAt!) : '—', trend: analysisByStageDate[0]?.buildingReference || 'Data indisponível no histórico do Fênix', trendPlain: true, icon: Clock3, tone: 'teal', filter: analysisByStageDate[0] ? `process:${analysisByStageDate[0].id}` : undefined },
    { label: 'Entrada mais antiga em análise', value: analysisByStageDate.at(-1) ? formatDate(analysisByStageDate.at(-1)!.analysisEnteredAt!) : '—', trend: analysisByStageDate.at(-1)?.buildingReference || 'Data indisponível no histórico do Fênix', trendPlain: true, icon: Clock3, tone: 'violet', filter: analysisByStageDate.at(-1) ? `process:${analysisByStageDate.at(-1)!.id}` : undefined },
    { label: 'Tempo médio em análise', value: overallAnalysisAverage.value, trend: overallAnalysisAverage.coverage, icon: Activity, tone: 'amber' }
  ] : view === 'notified' ? [
    { label: 'Notificados totais', value: notifiedProcesses.length, trend: 'processos atualmente notificados', icon: CircleAlert, tone: 'amber', filter: 'all' },
    { label: 'Notificação mais recente', value: notifiedByStageDate[0] ? formatDate(notifiedByStageDate[0].notificationEnteredAt!) : '—', trend: notifiedByStageDate[0]?.buildingReference || 'Data indisponível no histórico do Fênix', trendPlain: true, icon: Clock3, tone: 'blue', filter: notifiedByStageDate[0] ? `process:${notifiedByStageDate[0].id}` : undefined },
    { label: 'Notificação mais antiga', value: notifiedByStageDate.at(-1) ? formatDate(notifiedByStageDate.at(-1)!.notificationEnteredAt!) : '—', trend: notifiedByStageDate.at(-1)?.buildingReference || 'Data indisponível no histórico do Fênix', trendPlain: true, icon: Clock3, tone: 'violet', filter: notifiedByStageDate.at(-1) ? `process:${notifiedByStageDate.at(-1)!.id}` : undefined },
    { label: 'Média de notificações por processo', value: notificationAverage, trend: notificationHistoryCoverage, icon: Activity, tone: 'teal' }
  ] : view === 'stopped' ? [
    { label: 'Processos parados', value: stoppedProcesses.length, trend: 'nas três etapas selecionadas', icon: CirclePause, tone: 'amber', filter: 'all' },
    { label: 'Rascunho de Protocolo', value: stoppedProcesses.filter((item) => /rascunho de protocolo/i.test(`${item.status} ${item.stage}`)).length, trend: 'aguardando protocolo', icon: FileText, tone: 'blue', filter: 'stopped:draft' },
    { label: 'Pendente de Documentação', value: stoppedProcesses.filter((item) => /pendente de documentacao/i.test(`${item.status} ${item.stage}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())).length, trend: 'documentos a providenciar', icon: ClipboardList, tone: 'violet', filter: 'stopped:documentation' },
    { label: 'Pendente de Encaminhamento', value: stoppedProcesses.filter((item) => /pendente de encaminhamento/i.test(`${item.status} ${item.stage}`)).length, trend: 'aguardando encaminhamento', icon: Activity, tone: 'teal', filter: 'stopped:forwarding' }
  ] : view === 'certificates' ? [
    { label: 'Processos totais', value: certificateProcesses.length, trend: 'AVCBs e CLCBs', icon: ShieldCheck, tone: 'blue', filter: 'all' },
    { label: 'AVCBs aprovados', value: avcbProcesses.filter((item) => /homolog|aprov|certific/i.test(`${item.status} ${item.stage}`)).length, trend: `${avcbProcesses.length} processos AVCB`, icon: BadgeCheck, tone: 'teal', filter: 'approved:avcb' },
    { label: 'CLCBs aprovados', value: clcbProcesses.filter((item) => /homolog|aprov|certific/i.test(`${item.status} ${item.stage}`)).length, trend: `${clcbProcesses.length} processos CLCB`, icon: BadgeCheck, tone: 'violet', filter: 'approved:clcb' },
    { label: 'Em andamento', value: inProgressCertificates.length, trend: 'ainda sem aprovação registrada', icon: Activity, tone: 'amber', filter: 'in-progress:certificates' }
  ] : view === 'buildings' ? [
    { label: 'Edificações acompanhadas', value: visible.length, trend: 'edificações neste cadastro', icon: Building2, tone: 'teal', target: 'buildings' },
    { label: 'Com projeto PT ou PTS', value: new Set(projectProcesses.map((item) => item.buildingId)).size, trend: 'edificações distintas', icon: ClipboardList, tone: 'blue', target: 'projects' },
    { label: 'Com solicitação ou vistoria', value: new Set(requestProcesses.map((item) => item.buildingId)).size, trend: 'edificações distintas', icon: FileCheck2, tone: 'violet', target: 'analysis' },
    { label: 'Com pendências ou notificações', value: new Set(attentionProcesses.map((item) => item.buildingId)).size, trend: 'edificações distintas', icon: CircleAlert, tone: 'amber', target: 'notified' }
  ] : view === 'sync' ? [
    { label: 'Última consulta', value: data.sync.lastSync ? 1 : 0, trend: data.sync.lastSync ? formatDate(data.sync.lastSync) : 'ainda não realizada', icon: RefreshCw, tone: 'teal', target: 'sync' },
    { label: 'Consultas registradas', value: data.sync.runs.length, trend: 'execuções recentes', icon: Activity, tone: 'blue', target: 'sync' },
    { label: 'Falhas recentes', value: data.sync.runs.filter((run) => run.status === 'error').length, trend: 'nas últimas consultas', icon: CircleAlert, tone: 'amber', target: 'sync' },
    { label: 'Atualização automática', value: data.sync.intervalMinutes ? data.sync.intervalMinutes : 0, trend: data.sync.intervalMinutes ? 'minutos entre consultas' : 'somente manual', icon: Clock3, tone: 'violet', target: 'sync' }
  ] : [
    { label: 'Edificações acompanhadas', value: data.metrics.buildings, trend: 'edificações cadastradas', icon: Building2, tone: 'teal', target: 'buildings' },
    { label: 'Processos em análise', value: data.metrics.analysis, trend: 'processos do Fênix', icon: ClipboardList, tone: 'blue', target: 'analysis' },
    { label: 'Processos aguardando ação', value: data.metrics.attention, trend: 'processos do Fênix', icon: CircleAlert, tone: 'amber', target: 'notified' },
    { label: 'Processos com vistoria', value: data.metrics.inspections, trend: 'etapas de vistoria', icon: FileCheck2, tone: 'violet', target: 'analysis' }
  ];
  const openBuilding = (building: Building, tab = 'Edificação', processId?: string) => { setSelectedTab(tab); setSelectedProcessId(processId); setSelected(building); };
  return <Shell user={data.user} active={selected ? 'Edificações' : activeNav} breadcrumbs={selected ? <><b>Edificações</b><span>/</span><b>{selected.reference}</b></> : undefined} onNavigate={() => { setSelected(null); setAiOpen(false); }} onOpenAi={() => launchAi(null)} onSyncRunningChange={setExternalSyncRunning} onNotification={(notification) => {
    const target = data.buildings.find((item) => item.id === notification.buildingId);
    if (target) openBuilding(target, 'Edificação', notification.processId || undefined);
  }}>
    <div className="page-content dashboard-page">
      <div className="page-heading"><div><span className="section-kicker">PAINEL DE ACOMPANHAMENTO</span><h1>{viewTitle}</h1><p>{view === 'overview' ? 'Acompanhe suas edificações e processos de segurança contra incêndio.' : view === 'sync' ? 'Acompanhe quando os dados do Fênix foram atualizados.' : `Consulte ${viewTitle.toLocaleLowerCase('pt-BR')} vinculados às edificações do seu cadastro.`}</p></div><div className="page-heading-actions"><button className="button button-outline sync-button" onClick={() => void syncNow()} disabled={updateInProgress} aria-busy={updateInProgress}><RefreshCw size={15} className={updateInProgress ? 'spin' : ''} /> {updateInProgress ? 'Atualizando' : 'Atualizar agora'}</button><button className="icon-button heading-more" onClick={() => setSyncMenu(!syncMenu)} aria-label="Mais opções"><MoreHorizontal size={19} /></button>{syncMenu && <div className="popover"><b>Sincronização automática</b><p>A frequência é definida em Configurações; use 0 para desativar consultas automáticas.</p><span><Clock3 size={13} /> Próxima: {data.sync.intervalMinutes === 0 ? 'desativada; apenas manual' : data.sync.nextSync ? formatDate(data.sync.nextSync) : 'após a primeira consulta'}</span></div>}</div></div>
      <section className="metrics-grid">{contextualMetrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} trend={metric.trend} trendPlain={'trendPlain' in metric ? metric.trendPlain : false} icon={metric.icon} tone={metric.tone} onClick={'filter' in metric && metric.filter ? () => navigate(`/painel?view=${view}&filter=${encodeURIComponent(metric.filter!)}`) : undefined} />)}</section>
      {view === 'analysis' && <section className="average-breakdown"><h2>Tempo médio em análise por tipo</h2><p>Tempo decorrido desde a movimentação mais recente de entrada em análise, conforme o histórico do Fênix.</p><div className="average-breakdown-grid">{analysisGroups.map((group) => <div key={group.label}><b>{group.label}</b><strong>{group.value}</strong><small>{group.coverage}</small></div>)}</div></section>}
      <section className="ai-alert-card"><span className="ai-alert-icon"><Sparkles size={19} /></span><div className="ai-alert-copy"><b>Sinalização automática <span className="ai-label">DADOS</span></b><p>{data.metrics.attention ? `Encontramos ${data.metrics.attention} processo${data.metrics.attention > 1 ? 's' : ''} com status que merece${data.metrics.attention > 1 ? 'm' : ''} atenção. Abra uma edificação para entender os dados e próximos passos.` : 'Não há processos com pendências sinalizadas nos dados sincronizados.'}</p><small>Resumo baseado no status recebido do Fênix · {data.sync.lastSync ? `atualizado ${formatDate(data.sync.lastSync)}` : 'aguardando primeira consulta'}</small></div><button className="button button-ghost" onClick={() => launchAi(null, 'Analise a situação geral das edificações e processos acompanhados, destacando as pendências e prioridades de atenção.')}>Perguntar à IA <ArrowRight size={15} /></button></section>
      {view === 'renewals' ? <RenewalsWorkspace sourceAccounts={data.sourceAccounts || []} records={renewals} list={renewalList} onListChange={(list) => { setRenewalList(list); setRenewals([]); }} windowMonths={renewalWindow} onWindowChange={setRenewalWindow} onSaveWindow={() => void saveRenewalWindow()} savingWindow={savingRenewalWindow} error={renewalError} updatingId={updatingRenewalId} onDisposition={(item, disposition) => void updateRenewalDisposition(item, disposition)} onOpen={(buildingId, processId) => { const building = data.buildings.find((candidate) => candidate.id === buildingId); if (building) openBuilding(building, 'Histórico', processId); }} /> : view === 'sync' ? <><FenixConnectionsPanel user={data.user} revision={connectionRevision} onAdd={() => setConnectionModal({ mode: 'new' })} onManage={(connection) => setConnectionModal({ mode: 'manage', connection })} onReauthenticate={(connection) => setConnectionModal({ mode: 'reauth', connection })} onChanged={async () => { await refresh(); }} /><section className="sync-view-card"><div className="sync-view-icon"><Cloud size={20} /></div><div className="sync-view-copy"><span className="section-kicker">CONEXÃO PRINCIPAL</span><h2>Estado da sincronização</h2><p>{data.sync.message || 'As consultas usam a sessão autenticada do Fênix e somente leitura.'}</p><small>Última sincronização concluída: {data.sync.lastSync ? formatDate(data.sync.lastSync) : 'ainda não realizada'}</small></div><div className={`sync-view-status ${data.sync.status === 'error' ? 'sync-failed' : ''}`}><i />{data.sync.status === 'error' ? 'Última consulta falhou' : 'Conectado'}</div><button className="button button-outline" onClick={() => void syncNow()} disabled={updateInProgress} aria-busy={updateInProgress}><RefreshCw size={15} className={updateInProgress ? 'spin' : ''} /> {updateInProgress ? 'Atualizando' : 'Atualizar tudo'}</button></section><section className="sync-history"><div className="section-title-row"><div><h2>Histórico de consultas</h2><p>Execuções locais da sincronização da conta principal, mais recentes primeiro.</p></div><span className="sync-history-count">{data.sync.runs.length} registros</span></div>{data.sync.runs.length ? data.sync.runs.map((run) => <div className="sync-history-row" key={run.id}><span className={`sync-history-icon ${run.status === 'error' ? 'sync-history-error' : ''}`}><RefreshCw size={16} /></span><span><b>{run.status === 'error' ? 'Consulta com erro' : run.status === 'running' ? 'Consulta em andamento' : 'Consulta concluída'}</b><small>{run.message || 'Sem resumo retornado'}</small></span><time>{formatDate(run.completedAt || run.startedAt)}</time></div>) : <div className="sync-history-empty">Ainda não há execuções registradas.</div>}</section></> : ['projects', 'analysis', 'notified', 'stopped', 'certificates'].includes(view) ? <ProcessWorkspace view={view} processes={data.processes} buildings={data.buildings} sourceAccounts={data.sourceAccounts || []} historyRefreshStatus={data.historyRefresh.status} processMenuFilters={processMenuFilters} searchInputRef={searchInputRef} onOpen={openBuilding} onAsk={(building, prompt) => launchAi(building, prompt)} /> : <section className="building-section">
        <div className="section-title-row"><div><h2>Minhas edificações <span>{viewBuildings.length}</span></h2><p>Processos e situações vinculados às edificações acompanhadas.</p></div><div className="section-actions"><ExcelExportButton filename="fenix-edificacoes" sheetName="Edificações" columns={['Conta Fênix', 'Edificação', 'Município', 'Área total', 'Pavimentos', 'Protocolo', 'Tipo de processo', 'Status', 'Etapa atual', 'Última atualização', 'Quantidade de processos']} rows={buildingExportRows} /><button className="text-link" onClick={() => { setSearchFilters([]); setFilter('Todas'); }}>Ver todas <ArrowRight size={15} /></button></div></div>
        <div className="table-toolbar building-table-toolbar"><div className="filter-tabs">{['Todas', 'Em análise', 'Aguardando ação', 'Aprovadas'].map((tab) => <button key={tab} className={filter === tab ? 'selected' : ''} onClick={() => setFilter(tab)}>{tab}<span>{tab === 'Todas' ? viewBuildings.length : tab === 'Em análise' ? viewBuildings.filter((x) => /an[aá]lise/i.test(x.status)).length : tab === 'Aguardando ação' ? viewBuildings.filter((x) => /pend|exig|document|retific/i.test(x.status)).length : viewBuildings.filter((x) => /aprov|homolog|conclu/i.test(x.status)).length}</span></button>)}</div><div className="building-filter-row"><BuildingFilterSearch filters={searchFilters} sourceAccounts={data.sourceAccounts || []} inputRef={searchInputRef} onAdd={(nextFilter) => setSearchFilters((current) => [...current, nextFilter])} onRemove={(id) => setSearchFilters((current) => current.filter((item) => item.id !== id))} /><DateRangePicker from={appliedBuildingDateFrom} to={appliedBuildingDateTo} onApply={(from, to) => { setAppliedBuildingDateFrom(from); setAppliedBuildingDateTo(to); }} label="Última atualização" /></div></div>
        <div className="table-wrap"><table className="building-list-table"><thead><tr><th>EDIFICAÇÃO / REFERÊNCIA</th><th>MUNICÍPIO</th><th>ÁREA (M²)</th><th>PROCESSO / PROTOCOLO</th><th>ETAPA ATUAL</th><th>ÚLTIMA ATUALIZAÇÃO</th><th></th></tr></thead><tbody>{pageRows.map((item) => <tr key={item.id} onClick={() => openBuilding(item)} className="clickable-row"><td><span className="building-cell"><span className="building-thumb"><Building2 size={17} /></span><span className="building-cell-copy"><b>{item.reference}</b><span className="building-details-line"><small className="building-floor-count">{item.floors ? `${item.floors} ${item.floors === 1 ? 'pavimento' : 'pavimentos'}` : 'Edificação cadastrada'}</small><AccountSourceBadge name={item.sourceAccountName} paused={item.sourceAccountPaused} /></span></span></span></td><td><span className="city-cell"><MapPin size={13} />{item.municipality || '—'}</span></td><td>{formatArea(item.area)}</td><td><b className="protocol-text">{item.protocol}</b><small className="table-subtext">{item.processType}</small></td><td><StatusPill status={item.status} /></td><td><span className="sync-time">{formatDate(item.lastUpdated || (data.historyRefresh.status === "running" ? "Atualizando histórico…" : null))}</span></td><td><div className="row-actions"><button className="ai-row-button" onClick={(event) => { event.stopPropagation(); launchAi(item, 'Explique a situação atual desta edificação com base nos processos sincronizados e indique pendências e próximos passos.'); }} title="Entender situação com IA"><Sparkles size={15} /></button><button className="row-open" onClick={(event) => { event.stopPropagation(); openBuilding(item); }} aria-label="Abrir detalhes"><ArrowRight size={15} /></button></div></td></tr>)}{visible.length === 0 && <tr><td colSpan={7} className="empty-row"><Search size={20} /><b>{view === 'documents' ? 'Nenhum documento listado' : view === 'requests' ? 'Nenhuma solicitação ou vistoria encontrada' : view === 'projects' ? 'Nenhum projeto técnico encontrado' : 'Nenhuma edificação encontrada'}</b><span>{view === 'documents' ? 'O Fênix não retornou metadados de anexos na consulta atual.' : 'Ajuste a busca ou os filtros e tente novamente.'}</span></td></tr>}</tbody></table></div>
        <div className="table-foot"><span>Exibindo <b>{visible.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, visible.length)}</b> de <b>{visible.length}</b> edificações · {visibleProcessCount} processos nas edificações exibidas</span><div className="table-foot-right"><label className="page-size-select">Por página<select value={buildingPageSize} onChange={(event) => { setBuildingPageSize(event.target.value === 'all' ? 'all' : Number(event.target.value)); setPage(1); }} aria-label="Quantidade de edificações por página"><option value={50}>50</option><option value={75}>75</option><option value={100}>100</option><option value={150}>150</option><option value="all">Todos</option></select></label><span className={`sync-state ${data.sync.status === 'error' ? 'sync-failed' : ''}`}><span className="connection-dot" /> {data.sync.status === 'error' ? 'Falha na consulta' : `Última atualização: ${data.sync.lastSync ? formatDate(data.sync.lastSync) : 'ainda não sincronizado'}`}</span>{pageCount > 1 && <nav className="table-pagination" aria-label="Paginação da lista"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>Anterior</button><span>{page} / {pageCount}</span><button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>Próxima</button></nav>}</div></div>
      </section>}
      <section className="bottom-insight"><span className="insight-icon"><Sparkles size={19} /></span><div className="insight-copy"><div className="insight-title"><b>Leitura contextual com IA</b><span className="ai-label">SOB DEMANDA</span></div><p>Selecione uma edificação para entender o status, as etapas e as informações disponíveis no Fênix.</p></div><button className="button button-ai-outline" onClick={() => visible[0] && launchAi(visible[0], `Explique a situação atual da edificação ${visible[0].reference}, considerando seus processos, etapas, documentos e próximos passos.`)} disabled={!visible.length}><Sparkles size={14} /> Explicar processo <ArrowRight size={14} /></button></section>
    </div>
    {selected && <BuildingDrawer key={selected.id} building={selected} initialTab={selectedTab} initialProcessId={selectedProcessId} onClose={() => setSelected(null)} onAsk={(prompt) => launchAi(selected, prompt)} demo={data.user.demo} />}
    {aiOpen && <AiPanel building={aiBuilding} initialPrompt={aiPrompt} onClose={() => setAiOpen(false)} />}
    {toast && <div className="toast"><CheckCircle2 size={16} /> {toast}</div>}
    {connectionModal && <FenixConnectionModal mode={connectionModal.mode} connection={connectionModal.connection} onClose={() => setConnectionModal(null)} onSaved={(message) => { setToast(message); window.setTimeout(() => setToast(''), 4200); setConnectionRevision((revision) => revision + 1); void refresh(); setConnectionModal(null); }} />}
  </Shell>;
}

function BuildingDrawer({ building, initialTab = 'Edificação', initialProcessId, onClose, onAsk, demo }: { building: Building; initialTab?: string; initialProcessId?: string; onClose: () => void; onAsk: (prompt?: string) => void; demo: boolean }) {
  const [detail, setDetail] = useState<BuildingDetail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<string | null>(null);
  const [manualDaeIds, setManualDaeIds] = useState<Set<string>>(() => new Set());
  const [documentErrors, setDocumentErrors] = useState<Record<string, string>>({});
  const [aiInsight, setAiInsight] = useState('');
  const [aiInsightLoading, setAiInsightLoading] = useState(false);
  const [aiInsightUnavailable, setAiInsightUnavailable] = useState(false);
  const [aiSourcesOpen, setAiSourcesOpen] = useState(false);
  const [aiInsightSources, setAiInsightSources] = useState<Array<{ protocol: string; type: string; status: string; updatedAt: string; movements: number; documents: string[] }>>([]);
  useEffect(() => {
    let active = true;
    setDetail(null); setError(''); setAiInsight(''); setAiInsightSources([]); setAiInsightUnavailable(false);
    api<BuildingDetail>(`/api/buildings/${encodeURIComponent(building.id)}`).then(async (result) => {
      if (!active) return;
      setDetail(result);
      if (demo) return;
      setAiInsightLoading(true);
      try {
        const insight = await api<{ answer: string; sources: typeof aiInsightSources }>('/api/ai/insight', { method: 'POST', body: JSON.stringify({ buildingId: building.id }) });
        if (active) { setAiInsight(insight.answer); setAiInsightSources(insight.sources || []); }
      } catch {
        if (active) setAiInsightUnavailable(true);
      } finally { if (active) setAiInsightLoading(false); }
    }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [building.id, demo]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !document.querySelector('.ai-panel')) onClose(); }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [onClose]);
  useEffect(() => { setSelectedProcessId(null); }, [tab, building.id]);
  useEffect(() => { if (initialProcessId && detail?.processes.some((process) => process.id === initialProcessId)) setSelectedProcessId(initialProcessId); }, [detail, initialProcessId]);
  const allProcesses = detail?.processes || [];
  const projectProcesses = allProcesses.filter((item) => item.type.startsWith('Projeto técnico') || /\bPTS?\b/i.test(item.type));
  const requestProcesses = allProcesses.filter((item) => item.type.startsWith('Solicitação'));
  const tabProcesses = tab === 'Projetos' ? projectProcesses : tab === 'Solicitações / vistorias' ? requestProcesses : allProcesses;
  const process = tab === 'Histórico' || tab === 'Documentos' ? undefined : tabProcesses.find((item) => item.id === selectedProcessId) || tabProcesses[0];
  const timelineProcess = process?.timeline.length ? process : process ? allProcesses.find((item) => item.protocol === process.protocol && item.timeline.length > 0) : undefined;
  const displayedTimeline = timelineProcess?.timeline || process?.timeline || [];
  const contextProcess = process || allProcesses.find((item) => item.id === selectedProcessId) || allProcesses[0];
  const documents = allProcesses.flatMap((item) => item.documents);
  const officialDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Bahia' }).format(new Date(value));
  const validityHighlights = allProcesses.flatMap((item) => {
    const normalizedType = item.type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const events = item.timeline.filter((event) => event.date && Number.isFinite(Date.parse(event.date)));
    if (/avcb|clcb/.test(normalizedType)) {
      const approvedEvent = events.filter((event) => /homologad|aprovad|certificad/i.test(event.label)).sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!))[0];
      if (!approvedEvent) return [];
      const approvedParts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(approvedEvent.date!)).map((part) => [part.type, part.value]));
      const approvedDay = Number(approvedParts.day);
      const renewalDate = new Date(Date.UTC(Number(approvedParts.year) + 1, Number(approvedParts.month) - 1, approvedDay, 15));
      if (renewalDate.getUTCDate() !== approvedDay) renewalDate.setUTCDate(0);
      return [
        { key: `${item.id}-homologation`, label: 'Homologado em', value: officialDate(approvedEvent.date!), detail: item.type },
        { key: `${item.id}-renewal`, label: 'Renovação em', value: officialDate(renewalDate.toISOString()), detail: item.type }
      ];
    }
    if (/\bacp\b/i.test(item.type)) {
      const expiry = events.filter((event) => /valid[oa] ate|vencimento|data de validade/i.test(event.label.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).sort((a, b) => Date.parse(b.date!) - Date.parse(a.date!))[0];
      if (expiry) return [{ key: item.id, label: 'Válido até', value: officialDate(expiry.date!), detail: 'Data informada pelo Fênix' }];
    }
    return [];
  });
  if (detail?.building.validUntil && allProcesses.some((item) => /\bacp\b/i.test(item.type)) && !validityHighlights.some((item) => item.label === 'Válido até')) {
    const parsedValidity = Date.parse(detail.building.validUntil);
    validityHighlights.push({ key: 'building-acp-validity', label: 'Válido até', value: Number.isFinite(parsedValidity) ? officialDate(new Date(parsedValidity).toISOString()) : detail.building.validUntil, detail: 'Data informada pelo Fênix' });
  }
  const needsAttention = /pend|exig|notific|retific|devolv/i.test(`${contextProcess?.status || ''} ${contextProcess?.stage || ''}`);
  const approved = /aprov|homolog|conclu|certific/i.test(`${contextProcess?.status || ''} ${contextProcess?.stage || ''}`);
  const nextCheckText = needsAttention ? 'Abra a notificação no Fênix e confira o que foi solicitado; o painel não recebeu o conteúdo integral da exigência.' : approved ? 'Confira no Fênix a emissão e os dados do certificado oficial vinculado ao processo.' : documents.length ? 'Acompanhe a próxima atualização no Fênix e confira os documentos vinculados.' : 'Consulte o Fênix para localizar movimentações ou documentos associados.';
  const timelineMilestones = (items: ProcessDetail['timeline']) => {
    if (items.length <= 6) return items;
    const patterns = [/protocol|cadastr|rascunho|pagamento/i, /an[aá]lise/i, /notific|pend|valid|comunica|devol|retific|document|corre[cç]/i, /vistoria/i, /homolog|aprov|certific/i];
    const selected = patterns.map((pattern) => items.reduce((found, item, index) => pattern.test(item.label) ? index : found, -1)).filter((index) => index >= 0);
    const latest = items.length - 1;
    if (!selected.includes(latest)) selected.push(latest);
    return [...new Set(selected)].sort((a, b) => a - b).map((index) => items[index]);
  };
  async function downloadOfficialDocument(doc: DocumentItem) {
    if (!doc.processId || !doc.available) return;
    setDownloadingDocumentId(doc.id); setNotice(''); setDocumentErrors((current) => { const next = { ...current }; delete next[doc.id]; return next; });
    try {
      if (doc.kind === 'dae' && doc.daeId) {
        const pendingTab = window.open('about:blank', '_blank');
        if (pendingTab) pendingTab.opener = null;
        const result = await api<{ url: string }>(`/api/buildings/${encodeURIComponent(building.id)}/processes/${encodeURIComponent(doc.processId)}/daes/${encodeURIComponent(doc.daeId)}/open`);
        if (!/^https:\/\/servicos\.sefaz\.ba\.gov\.br\//i.test(result.url)) { pendingTab?.close(); throw new Error('O Fênix não retornou um endereço válido da SEFAZ-BA.'); }
        if (pendingTab) pendingTab.location.href = result.url;
        else window.location.assign(result.url);
        setNotice('DAE aberto no portal oficial da SEFAZ-BA.');
        return;
      }
      const endpoint = doc.kind === 'dae' && doc.daeId
        ? `/api/buildings/${encodeURIComponent(building.id)}/processes/${encodeURIComponent(doc.processId)}/daes/${encodeURIComponent(doc.daeId)}/download`
        : `/api/buildings/${encodeURIComponent(building.id)}/processes/${encodeURIComponent(doc.processId)}/${doc.kind === 'notification' ? 'notification' : doc.kind === 'protocol' ? 'protocol' : 'certificate'}`;
      const response = await fetch(endpoint, { credentials: 'same-origin' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 409 && doc.kind === 'dae') setManualDaeIds((current) => new Set(current).add(doc.id));
        throw new Error(data.error || 'Não foi possível baixar o documento oficial.');
      }
      const file = await response.blob();
      if (file.type !== 'application/pdf') throw new Error('O Fênix não retornou um arquivo PDF válido.');
      const disposition = response.headers.get('Content-Disposition') || '';
      const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const filename = encodedFilename ? decodeURIComponent(encodedFilename) : plainFilename || doc.name;
      const url = URL.createObjectURL(file); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setNotice(`${doc.kind === 'dae' ? 'DAE' : doc.kind === 'protocol' ? 'Comprovante de protocolo' : doc.kind === 'notification' ? 'Notificação' : 'Certificado'} oficial baixado do Fênix.`);
    } catch (error) { const message = error instanceof Error ? error.message : 'Falha ao baixar o documento oficial.'; setDocumentErrors((current) => ({ ...current, [doc.id]: message })); }
    finally { setDownloadingDocumentId(null); }
  }
  const documentsPanel = <div className="documents-block"><div className="timeline-title"><div><h4>Documentos anexados <span className="doc-count">{documents.length}</span></h4><small>O estado e a origem são informados por arquivo; documentos oficiais são consultados no Fênix.</small></div><button className="button button-ai-min" onClick={() => onAsk(`Analise os documentos vinculados à edificação ${building.reference}. Identifique quais constam nos dados, o que cada um indica e o que ainda precisa ser conferido no Fênix.`)}><Sparkles size={13} /> Analisar documentos</button></div>{documents.length ? <div className="document-list">{documents.map((doc) => {
    const errorMessage = documentErrors[doc.id] || doc.availabilityMessage;
    const manualDae = manualDaeIds.has(doc.id) || doc.availabilityMessage?.startsWith('A emissão deste DAE exige') === true;
    const retryMetadata = doc.status === 'metadata_error';
    const stateLabel = doc.kind === 'dae' && doc.available ? 'Abrir na SEFAZ-BA' : doc.status === 'demo' ? 'Arquivo ilustrativo' : errorMessage ? 'Indisponível' : doc.available ? 'Disponível' : 'Sem download';
    return <div className="document-row" key={doc.id}><span className="pdf-icon">PDF</span><span className="doc-info"><b>{doc.name}</b><small>{doc.source === 'fenix' ? `${doc.type} · Documento oficial` : `${doc.type} · ${formatDate(doc.date)}`}</small>{errorMessage && <small className="document-error-text">{errorMessage}</small>}</span><span className={`document-state ${errorMessage || !doc.available ? 'document-state-warning' : 'document-state-ready'}`}>{stateLabel}</span>{retryMetadata ? <button className="button button-ghost document-retry" onClick={async () => { setDownloadingDocumentId(doc.id); try { const result = await api<BuildingDetail>(`/api/buildings/${encodeURIComponent(building.id)}`); setDetail(result); setDocumentErrors((current) => { const next = { ...current }; delete next[doc.id]; return next; }); } catch (error) { setDocumentErrors((current) => ({ ...current, [doc.id]: error instanceof Error ? error.message : 'Falha ao consultar o Fênix.' })); } finally { setDownloadingDocumentId(null); } }}>{downloadingDocumentId === doc.id ? 'Consultando…' : 'Tentar novamente'}</button> : doc.source === 'fenix' ? <button className="icon-button doc-download" title={manualDae && doc.kind !== 'dae' ? 'A emissão do DAE exige uma etapa manual no portal da SEFAZ-BA' : !doc.available ? (errorMessage || 'Documento não disponível no Fênix.') : doc.kind === 'dae' ? 'Abrir DAE no portal SEFAZ-BA' : `Baixar ${doc.kind === 'protocol' ? 'comprovante de protocolo' : doc.kind === 'notification' ? 'notificação' : 'certificado'} oficial do Fênix`} aria-label={`${doc.kind === 'dae' ? 'Abrir' : 'Baixar'} ${doc.name}`} disabled={downloadingDocumentId === doc.id || (manualDae && doc.kind !== 'dae') || !doc.available} onClick={() => void downloadOfficialDocument(doc)}>{downloadingDocumentId === doc.id ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={16} />}</button> : demo ? <button className="icon-button doc-download" title="Arquivo ilustrativo; clique para ver o aviso" onClick={() => setNotice('Demonstração: este registro ilustra a lista de anexos e não contém um arquivo oficial.')}><ArrowDownToLine size={16} /></button> : <button className="icon-button doc-download" title="O Fênix não forneceu um endereço de download validado para este anexo." disabled><ArrowDownToLine size={16} /></button>}</div>;
  })}</div> : <div className="documents-empty"><FileText size={17} /> O Fênix não retornou documentos ou certificados disponíveis para esta edificação.</div>}{notice && <div className="document-notice" role="status"><CircleAlert size={13} /> {notice}</div>}{!demo && documents.some((doc) => doc.source === 'fenix') && <small className="source-limit">Documentos de retificação podem não ser autorizados pela sessão Fênix. O DAE pode exigir emissão manual na SEFAZ-BA.</small>}</div>;
  const historyPanel = <div className="history-list"><div className="timeline-title"><div><h4>Movimentações do processo</h4><small>Histórico oficial de status retornado pelo Fênix.</small></div><button className="button button-ai-min" onClick={() => onAsk(`Resuma em ordem cronológica o histórico dos processos da edificação ${building.reference}. Explique as mudanças relevantes, a situação atual e o próximo passo que os dados permitem inferir.`)}><Sparkles size={13} /> Resumir histórico</button></div>{allProcesses.length ? allProcesses.map((item) => <section className="history-process" key={item.id}><div className="history-process-title"><span className="history-entry-icon"><ClipboardList size={15} /></span><div><b>{item.type} · {item.protocol || 'Protocolo não informado'}</b><small>{item.timeline.length ? `${item.timeline.length} movimentações` : item.stage || item.status}</small></div><StatusPill status={item.status} /></div>{item.timeline.length ? <div className="history-event-list">{item.timeline.map((event, index) => <div className="history-event" key={`${event.label}-${event.date}-${index}`}><span className={`history-event-dot ${event.current ? 'current' : event.done ? 'done' : ''}`} /><span><b>{event.label}</b><small>{event.date ? formatDate(event.date) : 'Data não informada'}</small></span></div>)}</div> : <div className="timeline-empty">O Fênix não retornou movimentações detalhadas para este processo.</div>}</section>) : <div className="timeline-empty">Não há processos vinculados para compor o histórico.</div>}</div>;
  const relatedProcesses = (items: ProcessDetail[]) => items.length > 1 && <div className="related-process-list"><div className="timeline-title"><h4>Processos nesta edificação <span className="doc-count">{items.length}</span></h4></div>{items.map((item) => <button className={`related-process ${process?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => setSelectedProcessId(item.id)}><span><b>{item.protocol || 'Protocolo não informado'}</b><small>{item.type} · {formatDate(item.updatedAt)}</small></span><StatusPill status={item.status} /></button>)}</div>;
  return <div className="drawer-backdrop"><section className="building-drawer" aria-label={`Detalhes de ${building.reference}`}>
    <header className="drawer-header"><div><span className="section-kicker">FICHA DA EDIFICAÇÃO</span><h2>Detalhes da edificação</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></header>
    <div className="drawer-scroll"><div className="building-profile"><span className="profile-building"><Building2 size={27} /></span><div className="profile-main"><div><h3>{building.reference}</h3><span className="reference-code">REF-{building.id.slice(-5).toUpperCase()} · {contextProcess?.protocol || (detail ? 'Processo não vinculado' : 'Carregando processo...')}</span><AccountSourceBadge name={building.sourceAccountName} paused={building.sourceAccountPaused} /></div><StatusPill status={building.status} />{validityHighlights.length > 0 && <div className="profile-validity">{validityHighlights.map((item) => <div key={item.key}><b>{item.label}</b><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>}</div><div className="profile-meta"><span><MapPin size={14} /> {detail?.building.address || building.address || building.municipality}</span><span><Building2 size={14} /> {detail?.building.municipality || building.municipality}</span></div>{detail && <div className="building-facts" aria-label="Características da edificação">{[
      detail.building.use ? { label: 'Uso / ocupação', value: detail.building.use } : null,
      (detail.building.totalArea ?? detail.building.area) ? { label: 'Área total', value: formatArea(detail.building.totalArea ?? detail.building.area) } : null,
      detail.building.buildingArea ? { label: 'Área construída', value: formatArea(detail.building.buildingArea) } : null,
      detail.building.areaToBeBuilt ? { label: 'Área a construir', value: formatArea(detail.building.areaToBeBuilt) } : null,
      (detail.building.floors ?? building.floors) ? { label: 'Pavimentos', value: String(detail.building.floors ?? building.floors) } : null,
      detail.building.height ? { label: 'Altura', value: detail.building.height } : null,
    ].filter((fact): fact is { label: string; value: string } => Boolean(fact)).map((fact) => <div className="building-fact" key={fact.label}><small>{fact.label}</small><b>{fact.value}</b></div>)}{detail.building.technicalFacts?.map((fact) => <div className="building-fact" key={`technical-${fact.label}`}><small>{fact.label}</small><b>{fact.value}</b></div>)}</div>}</div>
      <nav className="drawer-tabs">{['Edificação', 'Projetos', 'Solicitações / vistorias', 'Documentos', 'Histórico'].map((name) => <button key={name} onClick={() => setTab(name)} className={tab === name ? 'selected' : ''}>{name}</button>)}</nav>
      {error ? <div className="drawer-error"><CircleAlert size={17} />{error}</div> : !detail ? <div className="detail-loading"><LoaderCircle className="spin" size={19} /> Carregando dados...</div> : <>
        <div className="detail-content-grid"><div className="detail-primary">
           {tab === 'Documentos' ? documentsPanel : tab === 'Histórico' ? historyPanel : <>
             <div className="detail-section-heading"><div><span className="section-kicker">SITUAÇÃO DO PROCESSO</span><h3>{tab === 'Edificação' ? 'Andamento atual' : tab}</h3></div>{process && <StatusPill status={process.status} />}</div>
             {process ? <>
               <div className="current-status-card"><div className="status-card-main"><span className={`status-dot-large ${statusTone(process.status)}`}>{statusTone(process.status) === 'green' ? <CheckCircle2 size={17} /> : statusTone(process.status) === 'amber' || statusTone(process.status) === 'red' ? <CircleAlert size={17} /> : <Clock3 size={17} />}</span><div><small>ETAPA ATUAL</small><b>{process.stage || process.status}</b><span>Protocolo {process.protocol || 'não informado'} · {process.type}</span></div></div><button className="button button-ai-soft" onClick={() => onAsk(`Explique em linguagem simples a situação atual do protocolo ${process.protocol || 'desta edificação'}, que está na etapa “${process.stage || process.status}”. Informe o que os dados confirmam, as pendências e o próximo passo a verificar no Fênix.`)}><Sparkles size={15} /> Explicar situação</button></div>
               <div className="timeline-block"><div className="timeline-title"><div><h4>Linha do tempo</h4>{displayedTimeline.length > 6 && <small>{displayedTimeline.length} movimentações · marcos principais{timelineProcess?.id !== process.id ? ` · projeto vinculado ${timelineProcess?.protocol || ''}` : ''}</small>}</div><button className="button button-ai-min" onClick={() => onAsk(`Resuma o histórico do protocolo ${process.protocol || 'selecionado'} em ordem cronológica, explicando o que aconteceu em cada etapa e como chegou à situação atual.`)}><Sparkles size={13} /> Resumir histórico</button></div>{displayedTimeline.length ? <div className="timeline">{timelineMilestones(displayedTimeline).map((item, index) => <div className={`timeline-step ${item.done ? 'done' : ''} ${item.current ? 'current' : ''}`} key={`${item.label}-${item.date}-${index}`}><span className="timeline-node">{item.done ? <Check size={11} /> : index + 1}</span><span className="timeline-label"><b>{item.label}</b><small>{item.date ? formatDate(item.date) : item.pending ? 'Aguardando etapa anterior' : 'Data não informada'}</small></span></div>)}</div> : <div className="timeline-empty">O Fênix não retornou movimentações detalhadas nesta consulta.</div>}</div>
               {tab !== 'Edificação' && relatedProcesses(tabProcesses)}
             </> : <div className="no-process-card"><FileCheck2 size={20} /><b>{tab === 'Projetos' ? 'Nenhum projeto técnico vinculado' : 'Nenhuma solicitação ou vistoria vinculada'}</b><span>Não encontramos registros desta categoria para a edificação na sincronização atual.</span></div>}
             {tab === 'Edificação' && documentsPanel}
           </>}
        </div><aside className="detail-ai-aside"><div className="ai-aside-head"><span className="ai-icon"><Sparkles size={16} /></span><div><b>Assistente de IA</b><small>{aiInsightLoading ? 'Analisando dados do processo...' : 'Leitura contextual · fontes do Fênix'}</small></div><span className="ai-live-dot" /></div><div className="ai-answer-card"><span className="ai-answer-label"><Sparkles size={12} /> {aiInsight ? 'LEITURA DA IA' : 'LEITURA INICIAL DOS DADOS'}</span><p>{aiInsightLoading ? 'A IA está conferindo a situação, o histórico e os documentos disponíveis...' : aiInsight || (contextProcess ? `O processo está na etapa “${contextProcess.stage || contextProcess.status}”. ${contextProcess.status.toLowerCase().includes('document') || contextProcess.status.toLowerCase().includes('exig') ? 'Os dados indicam uma pendência documental ou exigência. Consulte a notificação original no Fênix para identificar o que foi solicitado.' : 'A etapa mais recente foi registrada em ' + formatDate(contextProcess.updatedAt) + '. Consulte o Fênix para confirmar se houve nova movimentação.'}` : 'Não há dados de processo suficientes para explicar a situação desta edificação.')}</p><small>{aiInsight ? 'Gerada com OpenAI a partir dos dados selecionados · confira as fontes abaixo' : aiInsightUnavailable ? 'IA indisponível ou não configurada · leitura baseada no último status sincronizado' : 'Leitura dos dados sincronizados · confirme a informação no Fênix'}</small></div>{aiInsightSources.length > 0 && <details className="ai-citations ai-insight-sources" open={aiSourcesOpen} onToggle={(event) => { const isOpen = event.currentTarget.open; setAiSourcesOpen(isOpen); }}><summary>FONTES CONSULTADAS <span>· {aiInsightSources.length}</span></summary>{aiInsightSources.map((source, index) => <div key={`${source.protocol}-${source.type}-${index}`}><b>{source.protocol || 'Processo vinculado'} · {source.type}</b><span>{source.status} · {source.movements} movimentações{source.documents.length ? ` · ${source.documents.join(" · ")}` : ""} · {formatDate(source.updatedAt)}</span></div>)}</details>}<div className="next-check"><b><ListChecks size={15} /> Próxima verificação sugerida</b><span>{nextCheckText}</span></div><button className="button button-teal button-wide" onClick={() => onAsk()}><MessageCircle size={15} /> Conversar com a IA <ArrowRight size={15} /></button><div className="ai-source-note"><ShieldCheck size={14} /><span>As respostas da IA são sugestões rastreadas às fontes exibidas. Confirme decisões no Fênix.</span></div></aside></div>
      </>}
      <div className="drawer-sync-note"><Cloud size={14} /> Dados da última sincronização · {building.lastUpdated ? formatDate(building.lastUpdated) : 'sem data'} <button onClick={() => onAsk()}><Sparkles size={13} /> Perguntar</button></div>
    </div>
  </section></div>;
}

type AiTurn = { id: string; question: string; answer?: string; reasoningSummary?: string; sources?: Array<{ protocol: string; type: string; status: string; updatedAt: string; movements: number; documents: string[] }>; error?: string; loading?: boolean };

function AiPanel({ building, initialPrompt, onClose }: { building: Building | null; initialPrompt: string; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; buildingId: string | null; title: string; updatedAt: string }>>([]);
  const [sessionId, setSessionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sourceVisibility, setSourceVisibility] = useState<Record<string, boolean>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    api<{ configured: boolean }>('/api/settings/ai').then((result) => setConfigured(result.configured)).catch(() => setConfigured(false));
    void (async () => {
      try {
        const result = await api<{ sessions: typeof sessions }>('/api/ai/sessions');
        setSessions(result.sessions);
        const prior = result.sessions.find((item) => item.buildingId === (building?.id || null));
        if (prior) { await restoreSession(prior.id); if (initialPrompt) await ask(initialPrompt, prior.id); }
        else {
          const created = await api<{ id: string; buildingId: string | null; title: string; updatedAt: string }>('/api/ai/sessions', { method: 'POST', body: JSON.stringify({ buildingId: building?.id || null }) });
          setSessions((current) => [created, ...current]); setSessionId(created.id);
          if (initialPrompt) await ask(initialPrompt, created.id);
        }
      } catch { setConfigured(false); }
    })();
  }, []);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight; }, [turns, loading]);
  useEffect(() => { const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }; window.addEventListener('keydown', closeOnEscape); return () => window.removeEventListener('keydown', closeOnEscape); }, [onClose]);
  async function restoreSession(id: string) {
    const data = await api<{ messages: Array<{ id: string; role: string; content: string; reasoningSummary?: string; sources?: AiTurn['sources'] }> }>(`/api/ai/sessions/${id}`);
    setSessionId(id);
    const restored: AiTurn[] = [];
    for (const message of data.messages) {
      if (message.role === 'user') restored.push({ id: message.id, question: message.content });
      else { const previous = restored[restored.length - 1]; if (previous) { previous.answer = message.content; previous.reasoningSummary = message.reasoningSummary; previous.sources = message.sources || []; } }
    }
    setTurns(restored);
  }
  async function newSession() {
    const created = await api<{ id: string; buildingId: string | null; title: string; updatedAt: string }>('/api/ai/sessions', { method: 'POST', body: JSON.stringify({ buildingId: building?.id || null }) });
    setSessions((current) => [created, ...current]); setSessionId(created.id); setTurns([]); setQuestion('');
  }
  async function ask(text = question, targetSessionId = sessionId) {
    const submitted = text.trim();
    if (!submitted || loading || !targetSessionId) return;
    const turnId = crypto.randomUUID();
    setLoading(true); setQuestion('');
    setTurns((current) => [...current, { id: turnId, question: submitted, answer: '', loading: true }]);
    try {
      const response = await fetch('/api/ai/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: targetSessionId, question: submitted }) });
      if (!response.ok) { const problem = await response.json().catch(() => ({})); throw new Error(problem.error || `Erro HTTP ${response.status}`); }
      const reader = response.body?.getReader(); if (!reader) throw new Error('Streaming indisponível nesta conexão.');
      const decoder = new TextDecoder(); let buffer = ''; let complete: any = null;
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break; buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split('\n\n'); buffer = blocks.pop() || '';
        for (const block of blocks) {
          const eventName = block.match(/^event: (.+)$/m)?.[1]; const dataLine = block.match(/^data: (.+)$/m)?.[1]; if (!eventName || !dataLine) continue;
          if (eventName === 'delta') { const delta = JSON.parse(dataLine) as string; setTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, answer: `${turn.answer || ''}${delta}` } : turn)); }
          if (eventName === 'sources') { const sources = JSON.parse(dataLine); setTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, sources } : turn)); }
          if (eventName === 'complete') complete = JSON.parse(dataLine);
          if (eventName === 'failure') throw new Error(JSON.parse(dataLine).error);
        }
      }
      if (!complete) throw new Error('A resposta foi interrompida antes de terminar.');
      setTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, id: complete.id, answer: complete.answer, reasoningSummary: complete.reasoningSummary, sources: complete.sources || [], loading: false } : turn));
      setSessions((current) => current.map((item) => item.id === targetSessionId ? { ...item, title: item.title === 'Nova conversa' ? submitted.slice(0, 72) : item.title, updatedAt: complete.createdAt } : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível obter uma resposta.';
      setTurns((current) => current.map((turn) => turn.id === turnId ? { ...turn, error: message, loading: false } : turn));
    } finally { setLoading(false); }
  }
  return <div className="ai-panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="ai-panel">
      <header className="ai-panel-head"><div className="ai-panel-brand"><span className="ai-icon ai-icon-large"><Sparkles size={19} /></span><span><b>Assistente Fênix</b><small>IA contextual · {building ? 'Edificação selecionada' : 'Visão geral da conta'}</small></span></div><button className="icon-button" onClick={onClose} aria-label="Fechar assistente"><X size={18} /></button></header>
      <div className="ai-session-tools"><button className="button button-ai-min" onClick={() => void newSession()} disabled={loading}><MessageCircle size={14} /> Nova sessão</button><label htmlFor="ai-session-select">Histórico</label><select id="ai-session-select" value={sessionId} onChange={(event) => void restoreSession(event.target.value)}>{sessions.filter((item) => item.buildingId === (building?.id || null)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
      <div className="ai-context"><span className="context-label">CONTEXTO ATUAL</span>{building ? <><span><Building2 size={14} /> {building.reference}</span><span><ClipboardList size={14} /> {building.protocol} · {building.stage}</span></> : <span><Building2 size={14} /> Edificações e processos sincronizados da conta</span>}</div>
      <div className="ai-panel-content" ref={contentRef} aria-live="polite">
        <div className="assistant-message"><span className="ai-avatar"><Sparkles size={15} /></span><div><b>Olá! Posso ajudar a entender {building ? 'este processo' : 'suas edificações e processos'}.</b><p>{building ? 'Pergunte sobre a etapa atual, o histórico ou os documentos vinculados à edificação.' : 'Consulte situações, compare prioridades ou peça um panorama dos processos sincronizados.'}</p></div></div>
        {turns.map((turn) => <div className="ai-turn" key={turn.id}><div className="user-ai-question"><span>Você</span><p>{turn.question}</p></div>{turn.answer && <div className="user-ai-answer"><span className="ai-answer-label"><Sparkles size={12} /> RESPOSTA DA IA</span><p>{turn.answer}</p><small>Consulte as fontes do processo no Fênix antes de tomar qualquer decisão.</small></div>}{turn.sources?.length ? <details className="ai-citations" open={sourceVisibility[turn.id] ?? false} onToggle={(event) => { const isOpen = event.currentTarget.open; setSourceVisibility((current) => ({ ...current, [turn.id]: isOpen })); }}><summary>FONTES CONSULTADAS <span>· {turn.sources.length}</span></summary>{turn.sources.map((source, index) => <div key={`${source.protocol}-${source.type}-${index}`}><b>{source.protocol || 'Processo vinculado'} · {source.type}</b><span>{source.status} · {source.movements} movimentações{source.documents?.length ? ` · ${source.documents.join(" · ")}` : ""} · {formatDate(source.updatedAt)}</span></div>)}</details> : null}{turn.loading && <div className="assistant-loading"><LoaderCircle size={17} className="spin" /> Consultando os dados selecionados...</div>}{turn.error && <div className="ai-error"><CircleAlert size={15} />{turn.error}{turn.error.includes('Configure') && <Link to="/configuracoes" onClick={onClose}>Abrir configurações <ArrowRight size={13} /></Link>}</div>}</div>)}
        {turns.map((turn) => turn.reasoningSummary && <details key={`${turn.id}-reasoning`} className="ai-reasoning-summary" open><summary>Resumo da análise · {turn.question}</summary><p>{turn.reasoningSummary}</p></details>)}
        {configured === false && !turns.some((turn) => turn.error) && <div className="configure-ai-note"><Sparkles size={16} /><span><b>Ative respostas completas com IA</b><small>Configure sua chave OpenAI. A chave fica criptografada no banco local e nunca é enviada ao navegador em respostas.</small><Link to="/configuracoes" onClick={onClose}>Configurar agora <ArrowRight size={13} /></Link></span></div>}
      </div>
      {turns.length === 0 && <div className="suggested-prompts"><small>SUGESTÕES DE PERGUNTA</small><button onClick={() => void ask(building ? `Explique em linguagem simples a situação atual do processo ${building.protocol}.` : 'Quais processos precisam de mais atenção agora e por quê?')}>{building ? 'O que significa a etapa atual?' : 'Quais processos precisam de atenção?'}</button><button onClick={() => void ask(building ? 'O que devo conferir nos documentos deste processo?' : 'Quais edificações têm documentação pendente?')}>{building ? 'O que devo conferir nos documentos?' : 'Onde há documentação pendente?'}</button><button onClick={() => void ask(building ? 'Resuma o histórico deste processo e o que aconteceu por último.' : 'Resuma as mudanças mais relevantes nos processos acompanhados.')}>{building ? 'Resuma o histórico do processo' : 'Resuma as situações acompanhadas'}</button></div>}
      <form className="ai-input-area" onSubmit={(e) => { e.preventDefault(); void ask(); }}><div className="ai-composer"><input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={building ? 'Pergunte sobre esta edificação...' : 'Pergunte sobre seus processos...'} maxLength={1200} aria-label="Pergunta para o assistente Fênix" /><button type="submit" className="send-button" disabled={!question.trim() || loading} aria-label="Enviar pergunta"><Send size={16} /></button></div><div className="ai-input-bottom"><span>{turns.length ? 'A conversa permanece neste painel enquanto ele estiver aberto.' : 'Dados selecionados enviados à OpenAI quando você perguntar.'}</span></div></form>
      </aside>
  </div>;
}

function UserPreferences() {
  const [value, setValue] = useState({ syncIntervalMinutes: 30, aiDataAccess: true, aiIncludeDocuments: true, aiMaxProcesses: 1000, aiCustomPrompt: '', aiResponsePrompt: 'Explique os processos de incêndio em português simples, priorize pendências e próximos passos práticos e seja conciso.' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<typeof value>('/api/settings/preferences').then(setValue).catch((e) => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setSaved(false); setError('');
    try { await api('/api/settings/preferences', { method: 'PUT', body: JSON.stringify(value) }); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar as preferências.'); }
    finally { setBusy(false); }
  }
  const toggle = (key: 'aiDataAccess' | 'aiIncludeDocuments') => <label className="preference-toggle"><span><b>{key === 'aiDataAccess' ? 'Permitir acesso aos dados do Fênix' : 'Incluir nomes e metadados de documentos'}</b><small>{key === 'aiDataAccess' ? 'Controla se edificações e processos sincronizados entram no contexto da IA.' : 'Desative para omitir documentos das perguntas e respostas.'}</small></span><input type="checkbox" role="switch" checked={value[key]} onChange={(event) => setValue({ ...value, [key]: event.target.checked })} /></label>;
  return <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><Settings size={19} /></span><div><h2>IA e atualização automática</h2><p>Defina o contexto enviado à IA e a frequência das consultas ao Fênix.</p></div></div><form className="settings-form preferences-form" onSubmit={save}><label>Intervalo de sincronização (minutos)<input type="number" min="0" max="1440" step="1" value={value.syncIntervalMinutes} onChange={(e) => setValue({ ...value, syncIntervalMinutes: Number(e.target.value) })} /></label><small className="field-hint">Use 0 para desativar consultas automáticas. O mínimo ativo é 5 minutos; consultas manuais continuam disponíveis.</small><div className="preference-toggle-grid">{toggle('aiDataAccess')}{toggle('aiIncludeDocuments')}</div><label>Limite de processos enviados por consulta<input type="number" min="1" max="1000" value={value.aiMaxProcesses} onChange={(e) => setValue({ ...value, aiMaxProcesses: Number(e.target.value) })} /></label><small className="field-hint">A IA usa os processos mais recentes até esse limite. Menos registros reduzem o contexto enviado.</small><label>Prompt de resposta da IA<textarea rows={6} maxLength={5000} value={value.aiResponsePrompt} onChange={(e) => setValue({ ...value, aiResponsePrompt: e.target.value })} /></label><small className="field-hint">Define o foco, o tom e o nível de detalhe da resposta. As regras de segurança e a exigência de usar apenas dados disponíveis continuam protegidas.</small><label>Orientações adicionais<textarea rows={3} maxLength={3000} value={value.aiCustomPrompt} onChange={(e) => setValue({ ...value, aiCustomPrompt: e.target.value })} placeholder="Ex.: destaque primeiro documentos pendentes e próximos passos." /></label><small className="field-hint">Use para acrescentar preferências específicas à orientação principal.</small>{saved && <div className="settings-message">Preferências salvas.</div>}{error && <div className="settings-message error">{error}</div>}<div className="settings-actions"><button className="button button-teal" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Salvar preferências</button></div></form></section>;
}

function ProcessMenuSettings() {
  const [filters, setFilters] = useState<ProcessMenuFilters>(DEFAULT_PROCESS_MENU_FILTERS);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<{ filters: ProcessMenuFilters }>('/api/settings/process-menu-filters').then((result) => setFilters(result.filters)).catch((e) => setError(e.message)); }, []);
  const update = (key: ProcessMenuKey, field: keyof ProcessMenuFilter, value: string | string[]) => {
    setFilters((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
    setSaved(false); setError('');
  };
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setSaved(false); setError('');
    const normalized = Object.fromEntries(Object.entries(filters).map(([key, filter]) => [key, {
      ...filter,
      typeTerms: filter.typeTerms.map((term) => term.trim()).filter(Boolean),
      stageTerms: filter.stageTerms.map((term) => term.trim()).filter(Boolean)
    }])) as ProcessMenuFilters;
    try {
      const result = await api<{ filters: ProcessMenuFilters }>('/api/settings/process-menu-filters', { method: 'PUT', body: JSON.stringify({ filters: normalized }) });
      setFilters(result.filters); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar os filtros.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon connection-icon"><Filter size={19} /></span><div><h2>Filtros dos menus</h2><p>Defina quais processos aparecem nas listas de acompanhamento. As alterações são compartilhadas pela conta da empresa.</p></div></div><form className="settings-form menu-filter-form" onSubmit={(event) => void save(event)}><p className="field-hint menu-filter-explainer">Informe termos simples, um por linha. A comparação ignora maiúsculas e acentos. Dentro de cada campo, basta um termo corresponder; escolha abaixo se os grupos preenchidos devem corresponder todos ou qualquer um.</p>{(Object.keys(PROCESS_MENU_LABELS) as ProcessMenuKey[]).map((key) => <fieldset className="menu-filter-card" key={key}><legend>{PROCESS_MENU_LABELS[key]}</legend><div className="menu-filter-fields"><label>Tipo de processo<textarea rows={3} maxLength={1600} value={filters[key].typeTerms.join('\n')} onChange={(event) => update(key, 'typeTerms', event.target.value.split('\n').slice(0, 20))} placeholder="Ex.: Projeto técnico" /></label><label>Situação ou etapa<textarea rows={3} maxLength={1600} value={filters[key].stageTerms.join('\n')} onChange={(event) => update(key, 'stageTerms', event.target.value.split('\n').slice(0, 20))} placeholder="Ex.: Em análise" /></label></div><label className="menu-filter-join">Quando os dois campos tiverem termos<select value={filters[key].join} onChange={(event) => update(key, 'join', event.target.value as ProcessMenuFilter['join'])}><option value="all">Exigir correspondência nos dois grupos</option><option value="any">Aceitar correspondência em qualquer grupo</option></select></label><small className="field-hint">Preencha ao menos um dos campos. O processo precisa corresponder às regras deste menu para aparecer na lista.</small></fieldset>)}{saved && <div className="settings-message">Filtros salvos e aplicados às tabelas e aos indicadores.</div>}{error && <div className="settings-message error">{error}</div>}<div className="settings-actions"><button className="button button-teal" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Salvar filtros</button></div></form></section>;
}

function RenewalSettings() {
  const [days, setDays] = useState(60);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<{ overdueLimitDays: number }>('/api/settings/renewals').then((result) => setDays(result.overdueLimitDays)).catch((e) => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError('');
    try { const result = await api<{ overdueLimitDays: number }>('/api/settings/renewals', { method: 'PUT', body: JSON.stringify({ overdueLimitDays: days }) }); setDays(result.overdueLimitDays); setMessage('Limite de exibição salvo.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o limite.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><CalendarClock size={19} /></span><div><h2>Renovações</h2><p>Defina por quantos dias os certificados vencidos permanecem na lista ativa.</p></div></div><form className="settings-form renewal-settings-form" onSubmit={(event) => void save(event)}><label>Limite de exibição de renovações vencidas (dias)<input type="number" min="0" max="365" step="1" value={days} onChange={(event) => setDays(Number(event.target.value))} /></label><small className="field-hint">Após esse prazo, os vencidos saem da lista ativa. Use 0 para ocultar assim que vencer. O padrão é 60 dias.</small>{message && <div className="settings-message">{message}</div>}{error && <div className="settings-message error">{error}</div>}<div className="settings-actions"><button className="button button-teal" disabled={busy || days < 0 || days > 365}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Salvar limite</button></div></form></section>;
}

function WebhookIntegration() {
  const [configured, setConfigured] = useState(false);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<{ configured: boolean }>('/api/settings/webhook').then((result) => setConfigured(result.configured)).catch((e) => setError(e.message)); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await api<{ configured: boolean; delivered: boolean; message: string; deliveryError?: string }>('/api/settings/webhook', { method: 'PUT', body: JSON.stringify({ url }) });
      setConfigured(result.configured); setEditing(false); setUrl('');
      if (result.delivered) setMessage(result.message);
      else setError(`${result.message} ${result.deliveryError || ''}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o webhook.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setMessage('Enviando payload de teste...');
    try { const result = await api<{ message: string }>('/api/settings/webhook/test', { method: 'POST' }); setMessage(result.message); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível testar o webhook.'); setMessage(''); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(''); setMessage('');
    try { await api('/api/settings/webhook', { method: 'DELETE' }); setConfigured(false); setEditing(false); setUrl(''); setMessage('Webhook removido.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível remover o webhook.'); }
    finally { setBusy(false); }
  }
  return <section className="settings-card">
    <div className="settings-card-heading"><span className="settings-card-icon connection-icon"><Cloud size={19} /></span><div><h2>Integrações</h2><p>Envie mudanças de processos para um webhook da empresa.</p></div><span className={`settings-status ${configured ? 'active' : ''}`}><i /> {configured ? 'Configurado' : 'Opcional'}</span></div>
    <div className="webhook-integration-body">
      <p>Quando uma sincronização registrar uma nova notificação, enviaremos à URL configurada um POST JSON com os dados sincronizados da edificação e do processo antes e depois da mudança, além dos campos alterados. A URL fica criptografada no banco compartilhado da empresa; dados de autenticação do Fênix nunca são enviados.</p>
      {configured && !editing && <div className="webhook-configured"><span>Um webhook está configurado. O endereço é ocultado após salvar.</span><div className="settings-actions"><button className="button button-outline" disabled={busy} onClick={() => void test()}>{busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Testar</button><button className="button button-outline" disabled={busy} onClick={() => { setEditing(true); setMessage(''); }}>Editar webhook</button><button className="button button-danger" disabled={busy} onClick={() => void remove()}>Remover</button></div></div>}
      {!configured && !editing && <button className="button button-outline" onClick={() => { setEditing(true); setMessage(''); }}><Check size={15} /> Adicionar Webhook</button>}
      {editing && <form className="settings-form webhook-form" onSubmit={(event) => void save(event)}><label>URL do webhook<input type="url" inputMode="url" autoComplete="url" maxLength={2048} required placeholder="https://exemplo.com/webhooks/fenix" value={url} onChange={(event) => setUrl(event.target.value)} /></label><small className="field-hint">HTTPS é obrigatório em produção. Endereços locais, privados e de metadados são bloqueados. Ao salvar, o painel envia um payload de teste imediatamente.</small><div className="settings-actions"><button type="submit" className="button button-teal" disabled={busy || !url.trim()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Salvar webhook</button><button type="button" className="button button-outline" disabled={busy} onClick={() => { setEditing(false); setUrl(''); }}>Cancelar</button></div></form>}
      {message && <div className="settings-message">{message}</div>}{error && <div className="settings-message error">{error}</div>}
    </div>
  </section>;
}

type WebhookDeliveryLog = {
  id: number; eventId: string; event: string; title: string; message: string; buildingName: string;
  processId: string; protocol: string; documents: Array<{ name: string; type: string; availability: string; source: string }>;
  status: 'sending' | 'delivered' | 'failed'; attempts: number; lastHttpStatus: number | null;
  lastError: string; createdAt: string; lastAttemptAt: string | null; deliveredAt: string | null;
  attemptHistory: Array<{ source: string; status: string; httpStatus: number | null; error: string; attemptedAt: string }>;
};
function formatWebhookDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bahia' }).format(new Date(value));
}
function WebhookLogPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<{ name: string; demo: boolean } | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    try {
      const [log, me] = await Promise.all([
        api<{ deliveries: WebhookDeliveryLog[] }>('/api/webhook/log?limit=200'),
        api<{ user: { name: string; demo: boolean } }>('/api/auth/me')
      ]);
      setDeliveries(log.deliveries); setUser(me.user); setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar o log.');
      if (!user) navigate('/entrar');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [location.key]);
  async function resend(delivery: WebhookDeliveryLog) {
    setResendingId(delivery.id); setMessage(''); setError('');
    try {
      const result = await api<{ delivered: boolean; message: string; error?: string }>(`/api/webhook/log/${delivery.id}/resend`, { method: 'POST' });
      if (result.delivered) setMessage(`${result.message} · ${delivery.protocol || delivery.title}`);
      else setError(`${result.message} ${result.error || ''}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível reenviar.'); await load(); }
    finally { setResendingId(null); }
  }
  const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const visible = deliveries.filter((item) => !normalizedQuery || [item.title, item.message, item.buildingName, item.protocol, ...item.documents.map((doc) => doc.name)].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));
  if (!user) return <div className="loading-screen"><LoaderCircle className="spin" size={24} /></div>;
  return <Shell user={user} active="Log do webhook"><div className="page-content webhook-log-page">
    <div className="page-heading"><div><span className="section-kicker">INTEGRAÇÕES</span><h1>Log do webhook</h1><p>Consulte as entregas, arquivos associados e reenvie um payload quando necessário.</p></div><div className="page-heading-actions"><button className="button button-outline" onClick={() => void load()} disabled={loading}>{loading ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />} Atualizar</button><Link to="/configuracoes" className="button button-outline"><Settings size={15} /> Configurar webhook</Link></div></div>
    <div className="webhook-log-note"><ShieldCheck size={16} /><span>Os payloads ficam criptografados no banco para permitir reenvio. O Base64 dos documentos não é exibido nesta tela. O log mantém os 500 envios mais recentes.</span></div>
    {message && <div className="settings-message webhook-log-message">{message}</div>}{error && <div className="settings-message error webhook-log-message">{error}</div>}
    <section className="settings-card webhook-log-card"><div className="webhook-log-toolbar"><div><b>{visible.length} {visible.length === 1 ? 'envio' : 'envios'}</b><small> · {deliveries.filter((item) => item.status === 'failed').length} com falha</small></div><label className="webhook-log-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar processo, edificação ou documento" /></label></div>
      {loading && !deliveries.length ? <div className="webhook-log-empty"><LoaderCircle className="spin" size={18} /> Carregando envios...</div> : !visible.length ? <div className="webhook-log-empty"><ListChecks size={20} /><b>Nenhum envio encontrado</b><span>Os próximos testes e notificações aparecerão aqui.</span></div> : <div className="webhook-log-list">{visible.map((item) => <article className="webhook-log-row" key={item.id}>
        <div className="webhook-log-row-main"><div className="webhook-log-title"><div><b>{item.title || item.event}</b><small>{formatWebhookDate(item.createdAt)} · {item.event}</small></div><span className={`webhook-delivery-status ${item.status}`}><i />{item.status === 'delivered' ? 'Entregue' : item.status === 'sending' ? 'Enviando' : 'Falhou'}{item.lastHttpStatus ? ` · HTTP ${item.lastHttpStatus}` : ''}</span></div>
          <div className="webhook-log-process"><b>{item.buildingName || 'Edificação não identificada'}</b><span>{item.protocol || item.processId || 'Sem protocolo'}</span><p>{item.message}</p></div>
          <div className="webhook-log-documents"><b>Documentos ({item.documents.length})</b>{item.documents.length ? <div>{item.documents.map((doc, index) => <span className={`webhook-document-chip ${doc.availability === 'included' ? 'included' : ''}`} key={`${doc.name}-${index}`} title={`${doc.type} · ${doc.source}`}><FileText size={13} />{doc.name}{doc.availability === 'included' ? ' · Base64' : ' · metadados'}</span>)}</div> : <small>Nenhum documento associado</small>}</div>
          {item.lastError && <p className="webhook-log-error"><CircleAlert size={14} />{item.lastError}</p>}
          <details className="webhook-attempt-details"><summary>{item.attempts} {item.attempts === 1 ? 'tentativa' : 'tentativas'} · ver histórico</summary>{item.attemptHistory.map((attempt, index) => <div key={`${attempt.attemptedAt}-${index}`}><span>{formatWebhookDate(attempt.attemptedAt)} · {attempt.source === 'manual' ? 'reenvio manual' : attempt.source === 'test' ? 'teste' : 'automático'}</span><b>{attempt.status === 'delivered' ? 'Entregue' : 'Falhou'}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ''}</b>{attempt.error && <small>{attempt.error}</small>}</div>)}</details>
        </div><div className="webhook-log-row-action"><button className="button button-outline" onClick={() => void resend(item)} disabled={resendingId !== null || user.demo}>{resendingId === item.id ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />} Reenviar</button></div>
      </article>)}</div>}
    </section>
  </div></Shell>;
}

type FenixConnectionSummary = {
  id: string; label: string; status: 'active' | 'paused' | 'reauth_required' | 'error'; paused: boolean;
  webhookEnabled: boolean; selectedCount: number; lastSync: string | null; syncStatus: string; syncMessage: string;
};
type FenixConnectionBuilding = { id: string; reference: string; municipality: string; selected: boolean; available: boolean; possibleDuplicates?: string[] };

function connectionStatusLabel(status: FenixConnectionSummary['status']) {
  if (status === 'paused') return 'Pausada';
  if (status === 'reauth_required') return 'Precisa reconectar';
  if (status === 'error') return 'Falha na última consulta';
  return 'Ativa';
}

function FenixConnectionsPanel({ user, revision, onAdd, onManage, onReauthenticate, onChanged }: {
  revision: number;
  user: { demo: boolean }; onAdd: () => void; onManage: (connection: FenixConnectionSummary) => void;
  onReauthenticate: (connection: FenixConnectionSummary) => void; onChanged: () => Promise<void>;
}) {
  const [connections, setConnections] = useState<FenixConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editingLabel, setEditingLabel] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    setLoading(true);
    try {
      const result = await api<{ connections: FenixConnectionSummary[] }>('/api/fenix-connections');
      setConnections(result.connections); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível carregar as conexões.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [revision]);
  async function update(connection: FenixConnectionSummary, patch: Record<string, unknown>, successMessage: string) {
    setBusyId(connection.id); setMessage(''); setError('');
    try {
      await api(`/api/fenix-connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      setMessage(successMessage); await load(); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a conexão.'); }
    finally { setBusyId(''); }
  }
  async function sync(connection: FenixConnectionSummary) {
    setBusyId(connection.id); setMessage(''); setError('');
    try {
      const result = await api<{ syncWarning?: boolean; error?: string }>('/api/fenix-connections/' + encodeURIComponent(connection.id) + '/sync', { method: 'POST' });
      setMessage(result.syncWarning ? 'A conexão foi consultada, mas a atualização teve falhas.' : `Dados de ${connection.label} atualizados.`);
      await load(); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar essa conta.'); await load(); }
    finally { setBusyId(''); }
  }
  async function saveLabel(connection: FenixConnectionSummary) {
    if (!editingLabel.trim()) { setError('Informe um nome para a conexão.'); return; }
    await update(connection, { label: editingLabel.trim() }, 'Nome da conexão atualizado.');
    setEditingId('');
  }
  async function remove(connection: FenixConnectionSummary) {
    setBusyId(connection.id); setError(''); setMessage('');
    try {
      const result = await api<{ deletedBuildings: number }>('/api/fenix-connections/' + encodeURIComponent(connection.id), { method: 'DELETE', body: JSON.stringify({ deleteLocalData: true }) });
      setConfirmRemoveId(''); setMessage(`${connection.label} removida. ${result.deletedBuildings} edificações e os dados locais relacionados foram excluídos.`);
      await load(); await onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível remover a conexão.'); }
    finally { setBusyId(''); }
  }
  return <section className="settings-card fenix-connections-card">
    <div className="settings-card-heading"><span className="settings-card-icon connection-icon"><Cloud size={19} /></span><div><h2>Contas Fênix acompanhadas</h2><p>Conecte contas de clientes e selecione quais edificações entram no painel.</p></div><button className="button button-teal" onClick={onAdd} disabled={user.demo}><Plus size={15} /> Conta Fênix</button></div>
    {message && <div className="settings-message">{message}</div>}{error && <div className="settings-message error">{error}</div>}
    {loading ? <div className="connection-empty"><LoaderCircle size={18} className="spin" /> Carregando conexões...</div> : connections.length ? <div className="fenix-connection-list">{connections.map((connection) => <article className="fenix-connection-item" key={connection.id}>
      <div className="fenix-connection-top"><span className="connection-company-icon"><Cloud size={18} /></span><div className="fenix-connection-title"><div><b>{connection.label}</b><span className={`settings-status ${connection.status === 'active' ? 'active' : ''}`}><i />{connectionStatusLabel(connection.status)}</span></div><small>{connection.selectedCount} {connection.selectedCount === 1 ? 'edificação acompanhada' : 'edificações acompanhadas'} · última consulta {connection.lastSync ? formatDate(connection.lastSync) : 'ainda não realizada'}</small>{connection.syncMessage && connection.status !== 'active' && <small className="connection-last-error">{connection.syncMessage}</small>}</div></div>
      {editingId === connection.id && <form className="connection-rename-form" onSubmit={(event) => { event.preventDefault(); void saveLabel(connection); }}><label>Nome desta conexão<input value={editingLabel} maxLength={60} onChange={(event) => setEditingLabel(event.target.value)} autoFocus /></label><button className="button button-teal button-sm" disabled={busyId === connection.id}><Check size={14} /> Salvar</button><button className="button button-outline button-sm" type="button" onClick={() => setEditingId('')}>Cancelar</button></form>}
      <div className="fenix-connection-actions"><button className="button button-outline button-sm" onClick={() => onManage(connection)}><Building2 size={14} /> Gerenciar edificações</button>{connection.status === 'reauth_required' && <button className="button button-outline button-sm" onClick={() => onReauthenticate(connection)}><KeyRound size={14} /> Reconectar</button>}<button className="button button-outline button-sm" onClick={() => void sync(connection)} disabled={busyId === connection.id || connection.paused || !connection.selectedCount} title={!connection.selectedCount ? 'Selecione edificações para consultar esta conta.' : undefined}>{busyId === connection.id ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Atualizar</button><button className="button button-outline button-sm" onClick={() => void update(connection, { paused: !connection.paused }, connection.paused ? 'Sincronização retomada.' : 'Sincronização pausada.') } disabled={busyId === connection.id}>{connection.paused ? <Play size={14} /> : <Pause size={14} />}{connection.paused ? 'Retomar' : 'Pausar'}</button><button className="button button-outline button-sm" onClick={() => { setEditingId(connection.id); setEditingLabel(connection.label); setError(''); }}><Pencil size={14} /> Renomear</button><button className="button button-danger button-sm" onClick={() => setConfirmRemoveId(confirmRemoveId === connection.id ? '' : connection.id)} disabled={busyId === connection.id}><Trash2 size={14} /> Remover</button></div>
      <label className="connection-webhook-toggle"><input type="checkbox" checked={connection.webhookEnabled} onChange={(event) => void update(connection, { webhookEnabled: event.target.checked }, event.target.checked ? 'Mudanças dessa conta serão enviadas ao webhook.' : 'O webhook foi desativado para essa conta.')} /><span><b>Enviar mudanças ao webhook</b><small>Desativado por padrão para novas contas.</small></span></label>
      {confirmRemoveId === connection.id && <div className="connection-delete-confirm" role="alert"><b>Excluir conexão e dados locais?</b><p>A sessão, as edificações, processos, históricos, notificações e conversas dessa conta serão apagados do painel. Isso não altera o Fênix.</p><button className="button button-danger button-sm" onClick={() => void remove(connection)} disabled={busyId === connection.id}>{busyId === connection.id ? 'Excluindo…' : 'Excluir conexão e dados'}</button><button className="button button-outline button-sm" onClick={() => setConfirmRemoveId('')}>Cancelar</button></div>}
    </article>)}</div> : <div className="connection-empty"><Cloud size={20} /><b>Nenhuma conta de cliente conectada</b><span>Adicione uma conta Fênix para selecionar edificações de clientes.</span>{user.demo && <small>Entre com uma conta real da empresa para conectar contas adicionais.</small>}</div>}
  </section>;
}

function FenixConnectionModal({ mode, connection, onClose, onSaved }: {
  mode: 'new' | 'manage' | 'reauth'; connection?: FenixConnectionSummary;
  onClose: () => void; onSaved: (message: string) => void;
}) {
  const [siteKey, setSiteKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [step, setStep] = useState<'connect' | 'select'>(mode === 'manage' ? 'select' : 'connect');
  const [pendingId, setPendingId] = useState('');
  const [label, setLabel] = useState(connection?.label || 'Conta Fênix');
  const [buildings, setBuildings] = useState<FenixConnectionBuilding[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogAvailable, setCatalogAvailable] = useState(true);
  const [error, setError] = useState('');
  const [loginStage, setLoginStage] = useState(-1);
  const [loginCompleted, setLoginCompleted] = useState<number[]>([]);
  const captchaRef = useRef<HCaptcha>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const title = mode === 'new' ? 'Conectar conta Fênix' : mode === 'reauth' ? `Reconectar ${connection?.label || 'conta Fênix'}` : `Gerenciar ${connection?.label || 'conta Fênix'}`;
  async function loadExistingCatalog(preserveSelection = false) {
    if (!connection) return;
    setLoadingCatalog(true); setError('');
    try {
      const result = await api<{ buildings: FenixConnectionBuilding[]; catalogAvailable: boolean }>(`/api/fenix-connections/${encodeURIComponent(connection.id)}/buildings`);
      setBuildings(result.buildings);
      setSelectedIds((current) => new Set(result.buildings.filter((item) => preserveSelection ? current.has(item.id) : item.selected).map((item) => item.id)));
      setCatalogAvailable(result.catalogAvailable);
    } catch (e) { setCatalogAvailable(false); setError(e instanceof Error ? e.message : 'Não foi possível carregar as edificações.'); }
    finally { setLoadingCatalog(false); }
  }
  async function loadPendingCatalog(id: string) {
    setLoadingCatalog(true); setCatalogAvailable(true); setError('');
    try {
      const catalog = await api<{ buildings: FenixConnectionBuilding[] }>(`/api/fenix-connections/pending/${encodeURIComponent(id)}/buildings`);
      setBuildings(catalog.buildings.map((item) => ({ ...item, selected: false, available: true })));
      setSelectedIds(new Set());
    } catch (e) {
      setCatalogAvailable(false);
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as edificações dessa conta.');
    } finally { setLoadingCatalog(false); }
  }
  function retryCatalog() {
    if (pendingId) void loadPendingCatalog(pendingId);
    else void loadExistingCatalog(true);
  }
  function restartExpiredLogin() {
    if (pendingId) void api(`/api/fenix-connections/pending/${encodeURIComponent(pendingId)}`, { method: 'DELETE' }).catch(() => undefined);
    setPendingId(''); setStep('connect'); setBuildings([]); setSelectedIds(new Set()); setLabel('Conta Fênix');
    setCatalogAvailable(true); setError(''); setCaptchaToken(''); captchaRef.current?.resetCaptcha();
    window.setTimeout(() => emailRef.current?.focus(), 80);
  }
  useEffect(() => {
    void api<{ hcaptchaSiteKey: string }>('/api/config').then((result) => setSiteKey(result.hcaptchaSiteKey)).catch(() => setError('Não foi possível carregar o hCaptcha.'));
    if (mode === 'manage') void loadExistingCatalog();
    else window.setTimeout(() => emailRef.current?.focus(), 80);
  }, []);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) close(); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [busy, pendingId]);
  useEffect(() => () => { if (pendingId) void api(`/api/fenix-connections/pending/${encodeURIComponent(pendingId)}`, { method: 'DELETE' }).catch(() => undefined); }, [pendingId]);
  function close() {
    if (busy) return;
    if (pendingId) { void api(`/api/fenix-connections/pending/${encodeURIComponent(pendingId)}`, { method: 'DELETE' }).catch(() => undefined); setPendingId(''); }
    onClose();
  }
  async function login(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!captchaToken) { setError('Conclua o hCaptcha para continuar.'); return; }
    setBusy(true); setLoginStage(-1); setLoginCompleted([]);
    let poller: number | undefined;
    try {
      if (mode === 'reauth' && connection) {
        await api(`/api/fenix-connections/${encodeURIComponent(connection.id)}/reauthenticate`, { method: 'POST', body: JSON.stringify({ email, password, hcaptchaToken: captchaToken }) });
        setPassword(''); setCaptchaToken(''); captchaRef.current?.resetCaptcha();
        await loadExistingCatalog(); setStep('select');
      } else {
        const progressId = crypto.randomUUID();
        poller = window.setInterval(() => void api<{ stage: number; completedStages: number[] }>(`/api/auth/login/progress/${progressId}`).then((progress) => {
          setLoginStage((current) => Math.max(current, progress.stage)); setLoginCompleted((current) => [...new Set([...current, ...progress.completedStages])]);
        }).catch(() => undefined), 300);
        const result = await api<{ pendingId: string; accountName?: string }>('/api/fenix-connections/login', { method: 'POST', body: JSON.stringify({ email, password, hcaptchaToken: captchaToken, progressId }) });
        setPendingId(result.pendingId);
        setLabel(result.accountName || 'Conta Fênix'); setLoginStage(6); setLoginCompleted([0, 1, 2, 3, 4, 5, 6]); setStep('select');
        setPassword(''); setCaptchaToken(''); captchaRef.current?.resetCaptcha();
        await loadPendingCatalog(result.pendingId);
      }
      setPassword(''); setCaptchaToken(''); captchaRef.current?.resetCaptcha();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Não foi possível autenticar essa conta.';
      setError(message); setCaptchaToken(''); captchaRef.current?.resetCaptcha();
      if (mode === 'new' && pendingId) { await api(`/api/fenix-connections/pending/${encodeURIComponent(pendingId)}`, { method: 'DELETE' }).catch(() => undefined); setPendingId(''); }
    } finally { if (poller) window.clearInterval(poller); setBusy(false); }
  }
  async function saveSelection() {
    if (mode === 'new' && !selectedIds.size) { setError('Selecione ao menos uma edificação para acompanhar.'); return; }
    setBusy(true); setError('');
    try {
      if (mode === 'new') {
        const result = await api<{ connection: FenixConnectionSummary; syncWarning: boolean; syncMessage: string }>('/api/fenix-connections', { method: 'POST', body: JSON.stringify({ pendingId, label, selectedBuildingIds: [...selectedIds] }) });
        setPendingId(''); onSaved(result.syncWarning ? `${result.connection.label} foi conectada. A sincronização inicial precisa de nova tentativa: ${result.syncMessage}` : `${selectedIds.size} edificações de ${result.connection.label} agora estão em acompanhamento.`);
      } else if (connection) {
        const result = await api<{ syncWarning: boolean; syncMessage: string }>(`/api/fenix-connections/${encodeURIComponent(connection.id)}/buildings`, { method: 'PUT', body: JSON.stringify({ selectedBuildingIds: [...selectedIds] }) });
        if (label.trim() && label.trim() !== connection.label) await api(`/api/fenix-connections/${encodeURIComponent(connection.id)}`, { method: 'PATCH', body: JSON.stringify({ label: label.trim() }) });
        onSaved(result.syncWarning ? `Seleção salva. A atualização de ${label} teve uma falha: ${result.syncMessage}` : `Seleção de ${label} atualizada: ${selectedIds.size} edificações em acompanhamento.${result.syncMessage ? ` ${result.syncMessage}` : ''}`);
      }
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar as edificações selecionadas.'); }
    finally { setBusy(false); }
  }
  const visibleBuildings = buildings.filter((item) => `${item.reference} ${item.municipality}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const selectedCount = selectedIds.size;
  const toggleBuilding = (item: FenixConnectionBuilding) => {
    if (!item.available && !selectedIds.has(item.id)) return;
    setSelectedIds((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; });
  };
  return <div className="fenix-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="fenix-connect-modal" role="dialog" aria-modal="true" aria-labelledby="fenix-connect-title" aria-busy={busy}>
      <header className="fenix-modal-header"><div><span className="section-kicker">{step === 'connect' ? 'PASSO 1 DE 2 · CONECTAR' : 'PASSO 2 DE 2 · SELECIONAR'}</span><h2 id="fenix-connect-title">{title}</h2><p>{step === 'connect' ? 'A conta principal do Painel continuará conectada.' : 'Escolha quais edificações essa conta vai acompanhar.'}</p></div><button className="icon-button" aria-label="Fechar" onClick={close} disabled={busy}><X size={19} /></button></header>
      <div className={`fenix-modal-step ${step === 'select' ? 'fenix-step-active' : ''}`} key={step}>
        {step === 'connect' ? <form className="fenix-login-form" onSubmit={(event) => void login(event)}>
          <div className="fenix-modal-notice"><ShieldCheck size={17} /><span>Use a conta do cliente. Você precisa ter autorização para acompanhar os dados dela.</span></div>
          <label>Usuário ou e-mail Fênix<input ref={emailRef} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Senha Fênix<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          <div className="captcha-wrap fenix-modal-captcha">{siteKey && <HCaptcha ref={captchaRef} sitekey={siteKey} onVerify={setCaptchaToken} onExpire={() => setCaptchaToken('')} onError={() => setError('Não foi possível validar o hCaptcha. Tente novamente.')} />}</div>
          {error && <div className="form-error" role="alert"><CircleAlert size={15} />{error}</div>}
          {busy && <div className="connection-login-progress" aria-live="polite"><LoaderCircle className="spin" size={16} />{loginStage < 0 ? 'Validando acesso com o Fênix…' : loginStage < 4 ? 'Autenticando a conta…' : 'Acesso aprovado; carregando a lista…'}</div>}
          <button className="button button-teal button-wide" type="submit" disabled={busy || !siteKey}>{busy ? <><LoaderCircle size={15} className="spin" /> Conectando…</> : <>Conectar conta <ArrowRight size={15} /></>}</button>
          <small className="field-hint">A senha e o token hCaptcha são usados apenas para autenticar. O Painel guarda a sessão criptografada para futuras consultas.</small>
        </form> : <div className="fenix-building-picker">
          <div className="fenix-selection-summary"><div><b>{selectedCount} {selectedCount === 1 ? 'selecionada' : 'selecionadas'}</b><small>{mode === 'new' ? 'Apenas as selecionadas serão adicionadas ao painel.' : 'As desmarcadas deixam as listas ativas e ficam guardadas para reativação.'}</small></div><label className="fenix-connection-label">{mode === 'new' ? 'Nome para identificar esta conta' : 'Nome da conexão'}<input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} /></label></div>
          {!catalogAvailable && <div className="settings-message error fenix-catalog-retry" role="alert"><span>{error || (buildings.length ? 'Não foi possível atualizar a lista agora. A última lista salva continua disponível.' : 'Não foi possível carregar a lista desta conta.')}</span>{mode === 'new' && pendingId && error.toLocaleLowerCase('pt-BR').includes('expirou') ? <button className="button button-outline button-sm" type="button" onClick={restartExpiredLogin}>Fazer login novamente</button> : <button className="button button-outline button-sm" type="button" onClick={retryCatalog} disabled={loadingCatalog || (mode === 'new' && !pendingId)}>{loadingCatalog ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />} Tentar carregar novamente</button>}</div>}
          {loadingCatalog ? <div className="fenix-building-skeletons" aria-label="Carregando edificações">{Array.from({ length: 6 }, (_, index) => <div key={index}><i /><span><b /><small /></span></div>)}</div> : buildings.length ? <>
            <label className="fenix-building-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar edificação ou município" /></label>
            <div className="fenix-building-list">{visibleBuildings.map((item) => {
              const selected = selectedIds.has(item.id);
              return <button type="button" key={item.id} role="checkbox" aria-checked={selected} aria-label={`${item.reference}, ${item.municipality || 'município não informado'}`} className={`fenix-building-option ${selected ? 'selected' : ''} ${!item.available ? 'unavailable' : ''}`} onClick={() => toggleBuilding(item)} disabled={!item.available && !selected}>
                <span className="fenix-building-option-icon"><Building2 size={17} /></span><span className="fenix-building-option-copy"><b>{item.reference}</b><small>{item.municipality || 'Município não informado'}{!item.available ? ' · não retornada na última consulta' : ''}</small>{Boolean(item.possibleDuplicates?.length) && <small className="fenix-building-duplicate">Possível duplicidade: já acompanhada em {item.possibleDuplicates?.join(', ')}</small>}</span><span className={`fenix-switch ${selected ? 'on' : ''}`} aria-hidden="true"><i /></span>
              </button>;
            })}{!visibleBuildings.length && <div className="connection-empty"><Search size={18} />Nenhuma edificação corresponde à busca.</div>}</div>
          </> : !catalogAvailable ? <div className="connection-empty"><Building2 size={20} /><b>Lista temporariamente indisponível</b><span>Você pode tentar novamente sem repetir o login.</span></div> : <div className="connection-empty"><Building2 size={20} /><b>Nenhuma edificação encontrada nessa conta</b><span>O Fênix não retornou edificações disponíveis para acompanhamento.</span><button className="button button-outline button-sm" type="button" onClick={retryCatalog} disabled={loadingCatalog}><RefreshCw size={14} /> Tentar carregar novamente</button></div>}
          {error && catalogAvailable && <div className="settings-message error" role="alert">{error}</div>}
        </div>}
      </div>
      {step === 'select' && <footer className="fenix-modal-footer"><button className="button button-outline" onClick={() => mode === 'new' ? close() : setStep('connect')} disabled={busy}>{mode === 'new' ? 'Cancelar' : mode === 'reauth' ? 'Voltar ao login' : 'Fechar'}</button><span>{selectedCount} {selectedCount === 1 ? 'edificação' : 'edificações'} selecionadas</span><button className="button button-teal" onClick={() => void saveSelection()} disabled={busy || (mode === 'new' && selectedCount === 0)}>{busy ? <><LoaderCircle size={15} className="spin" /> Salvando…</> : <>{mode === 'new' ? 'Acompanhar' : 'Salvar seleção'} {mode === 'new' ? selectedCount : ''} <ArrowRight size={15} /></>}</button></footer>}
      {busy && !(step === 'select' && loadingCatalog) && <div className="fenix-modal-processing" aria-live="polite"><div><LoaderCircle size={30} className="spin" /><b>{step === 'connect' ? 'Conectando à conta Fênix' : 'Salvando acompanhamento'}</b><span>{step === 'connect' ? 'O login não altera sua conta principal.' : 'Aplicando a seleção e preparando a sincronização.'}</span></div></div>}
    </section>
  </div>;
}

function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [configured, setConfigured] = useState(false);
  const [key, setKey] = useState('');
  const [model, setModel] = useState('gpt-6-astra');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<{ name: string; demo: boolean } | null>(null);
  const [connectionModal, setConnectionModal] = useState<{ mode: 'new' | 'manage' | 'reauth'; connection?: FenixConnectionSummary } | null>(null);
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [connectionMessage, setConnectionMessage] = useState('');
  useEffect(() => {
    Promise.all([api<{ configured: boolean; model: string }>('/api/settings/ai'), api<{ user: { name: string; demo: boolean } }>('/api/auth/me')])
      .then(([ai, me]) => { setConfigured(ai.configured); setModel(ai.model); setUser(me.user); })
      .catch(() => navigate('/entrar'));
  }, [navigate, location.key]);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage('');
    try { const result = await api<{ configured: boolean; model: string }>('/api/settings/ai', { method: 'PUT', body: JSON.stringify({ apiKey: key, model }) }); setConfigured(result.configured); setModel(result.model); setKey(''); setMessage(result.configured ? 'Configuração salva. A chave foi armazenada criptografada neste computador.' : 'Modelo atualizado. Adicione uma chave para ativar a IA.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  }
  if (!user) return <div className="loading-screen"><LoaderCircle className="spin" size={24} /></div>;
  return <Shell user={user} active="Configurações"><div className="page-content settings-page"><div className="page-heading"><div><span className="section-kicker">PREFERÊNCIAS DO PAINEL</span><h1>Configurações</h1><p>Configure os filtros, a IA e as conexões com o Fênix.</p></div></div><section className="settings-card"><div className="settings-card-heading"><span className="settings-card-icon"><Sparkles size={19} /></span><div><h2>Assistente de IA</h2><p>Respostas sobre as situações das edificações, com base nos dados consultados.</p></div><span className={`settings-status ${configured ? 'active' : ''}`}><i /> {configured ? 'Configurado' : 'Precisa configurar'}</span></div><form className="settings-form" onSubmit={save}><label>Chave da API OpenAI<div className="settings-secret-field"><input type="password" autoComplete="new-password" placeholder={configured ? 'Chave salva · preencha para substituir' : 'sk-...'} value={key} onChange={(e) => setKey(e.target.value)} /><LockKeyhole size={16} /></div></label><small className="field-hint">A chave é criptografada com AES-256-GCM e armazenada apenas no banco local deste computador. Ela não é exibida novamente.</small><label>Modelo<input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-6-astra" /></label><div className="settings-data-note"><ShieldCheck size={16} /><span><b>Privacidade antes de cada consulta</b><small>Cada pergunta envia o contexto configurado e as últimas mensagens da sessão. CPF, CNPJ, endereço completo e contatos são removidos do contexto dos processos; o texto digitado por você é enviado para responder à pergunta. A IA não roda em segundo plano.</small></span></div>{message && <div className={`settings-message ${message.startsWith('Não') ? 'error' : ''}`}>{message}</div>}<div className="settings-actions"><button type="submit" className="button button-teal" disabled={saving}>{saving ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Salvar configuração</button>{configured && <button type="button" className="button button-danger" onClick={async () => { await api('/api/settings/ai', { method: 'DELETE' }); setConfigured(false); setMessage('Chave removida do banco local.'); }}>Remover chave</button>}</div></form></section><UserPreferences /><ProcessMenuSettings /><RenewalSettings /><WebhookIntegration /><FenixConnectionsPanel user={user} revision={connectionRevision} onAdd={() => setConnectionModal({ mode: 'new' })} onManage={(connection) => setConnectionModal({ mode: 'manage', connection })} onReauthenticate={(connection) => setConnectionModal({ mode: 'reauth', connection })} onChanged={async () => undefined} />{connectionMessage && <div className="settings-message">{connectionMessage}</div>}<section className="settings-card settings-connection"><div className="settings-card-heading"><span className="settings-card-icon connection-icon"><Cloud size={19} /></span><div><h2>Acesso principal ao Fênix</h2><p>Autenticação feita pelo próprio Fênix, usando hCaptcha.</p></div><span className={`settings-status ${user.demo ? '' : 'active'}`}><i /> {user.demo ? 'Demonstração' : 'Sessão ativa'}</span></div><p className="settings-footnote">A senha não é armazenada. Cookies da sessão ficam criptografados localmente; o Fênix pode exigir nova autenticação quando a sessão expirar.</p></section>{connectionModal && <FenixConnectionModal mode={connectionModal.mode} connection={connectionModal.connection} onClose={() => setConnectionModal(null)} onSaved={(savedMessage) => { setConnectionMessage(savedMessage); setConnectionRevision((revision) => revision + 1); setConnectionModal(null); }} />}</div></Shell>;
}

function ProtectedDashboard() {
  return <DashboardPage />;
}

export default function App() {
  return <Routes><Route path="/" element={<Landing />} /><Route path="/entrar" element={<Login />} /><Route path="/painel" element={<ProtectedDashboard />} /><Route path="/configuracoes" element={<SettingsPage />} /><Route path="/log" element={<WebhookLogPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
