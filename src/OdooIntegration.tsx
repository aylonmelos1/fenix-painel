import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Activity, AtSign, Building2, CalendarDays, Check, CircleAlert, FileText, LoaderCircle, MessageCircle, Paperclip, Plus, RefreshCw, Search, Send, UserRound, X } from 'lucide-react';
import { api, formatDate, type DocumentItem } from './types';

type Relation = false | number | [number, string] | number[];
type OdooBootstrap = { configured: boolean; projectId: number | null; buildingReference: string; reason: 'demo' | 'not_configured' | null };
type OdooSnapshot = {
  project: { id: number; name: string; description: string; customer: Relation; manager: Relation; stage: Relation; startDate: string | false; endDate: string | false; taskCount: number; openTaskCount: number; createdAt: string | false; updatedAt: string | false };
  tasks: Array<{ id: number; name: string; stage: Relation; assignees: Relation; deadline: string | false; priority: string }>;
  messages: Array<{ id: number; date: string | false; author: Relation; body: string; type: string; subtype: Relation; subject: string | false; attachmentIds: number[] }>;
  activities: Array<{ id: number; type: Relation; summary: string; note: string; deadline: string | false; assignee: Relation; state: string }>;
  activityTypes: Array<{ id: number; name: string; category: string }>;
};
type OdooSuggestion = { id: number; name: string; customer: Relation; stage: Relation; taskCount: number; openTaskCount: number; matchScore: number };
type OdooPreview = { projectId: number; snapshot?: OdooSnapshot; loading: boolean; error?: string };
type OdooPerson = { userId: number; partnerId: number; name: string };
type OdooAssignee = { id: number; name: string; partnerId: number };

function relationName(value: Relation) {
  if (Array.isArray(value)) return typeof value[1] === 'string' ? value[1] : `${value.length} responsável(is)`;
  return typeof value === 'number' ? `ID ${value}` : 'Não informado';
}
function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function dateOnly(value: string | false) {
  if (!value) return 'Não definida';
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
}
function messageDate(value: string | false) {
  return value ? formatDate(value.includes('T') ? value : value.replace(' ', 'T') + 'Z') : 'Data não informada';
}
function isInternalNote(message: OdooSnapshot['messages'][number]) {
  return Array.isArray(message.subtype) && /note|nota/i.test(String(message.subtype[1]));
}

export function OdooIntegration({ buildingId, documents, demo }: { buildingId: string; documents: DocumentItem[]; demo: boolean }) {
  const [bootstrap, setBootstrap] = useState<OdooBootstrap | null>(null);
  const [snapshot, setSnapshot] = useState<OdooSnapshot | null>(null);
  const [suggestions, setSuggestions] = useState<OdooSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [preview, setPreview] = useState<OdooPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [noteSending, setNoteSending] = useState(false);
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [noteFiles, setNoteFiles] = useState<File[]>([]);
  const [selectedMentions, setSelectedMentions] = useState<OdooPerson[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPeople, setMentionPeople] = useState<OdooPerson[]>([]);
  const [mentionsLoading, setMentionsLoading] = useState(false);
  const [activityTypeId, setActivityTypeId] = useState('');
  const [activityAssigneeId, setActivityAssigneeId] = useState('');
  const [activitySummary, setActivitySummary] = useState('');
  const [activityNote, setActivityNote] = useState('');
  const [activityDeadline, setActivityDeadline] = useState(localDate);
  const [activitySending, setActivitySending] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [activityFiles, setActivityFiles] = useState<File[]>([]);
  const [assignees, setAssignees] = useState<OdooAssignee[]>([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);
  const [sendingDocumentId, setSendingDocumentId] = useState<string | null>(null);
  const noteRequestId = useRef<string | null>(null);
  const noteEditorRef = useRef<HTMLTextAreaElement | null>(null);
  const noteFileInputRef = useRef<HTMLInputElement | null>(null);
  const activityFileInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshProject() {
    setRefreshing(true); setError('');
    try {
      const result = await api<OdooSnapshot>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/project`);
      setSnapshot(result);
      setActivityTypeId((current) => result.activityTypes.some((item) => String(item.id) === current) ? current : String(result.activityTypes[0]?.id || ''));
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível consultar a Odoo.');
    } finally { setRefreshing(false); }
  }

  async function refreshSuggestions() {
    setSuggestionsLoading(true); setSuggestionsError('');
    try {
      const result = await api<{ projects: OdooSuggestion[] }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/suggestions`);
      setSuggestions(result.projects);
    } catch (loadError) {
      setSuggestionsError(loadError instanceof Error ? loadError.message : 'Não foi possível buscar projetos semelhantes na Odoo.');
    } finally { setSuggestionsLoading(false); }
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSnapshot(null); setSuggestions([]); setSuggestionsError(''); setBootstrap(null); setPreview(null);
    api<OdooBootstrap>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo`).then((result) => {
      if (!active) return;
      setBootstrap(result); setProjectId(result.projectId ? String(result.projectId) : '');
      if (result.configured) {
        if (result.projectId) void refreshProject();
        else { setLinkEditorOpen(true); void refreshSuggestions(); }
      }
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar a integração Odoo.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [buildingId]);

  useEffect(() => {
    if ((!preview && !activityModalOpen) || linking || activitySending) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPreview(null); setActivityModalOpen(false); }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [preview, linking, activityModalOpen, activitySending]);

  useEffect(() => {
    const query = mentionQuery.trim();
    if (!mentionOpen || query.length < 2) { setMentionPeople([]); setMentionsLoading(false); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setMentionsLoading(true);
      api<{ people: OdooPerson[] }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/people?q=${encodeURIComponent(query)}`)
        .then((result) => { if (active) setMentionPeople(result.people); })
        .catch(() => { if (active) setMentionPeople([]); })
        .finally(() => { if (active) setMentionsLoading(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [buildingId, mentionOpen, mentionQuery]);

  async function openPreview(id: number) {
    setProjectId(String(id)); setError(''); setFeedback(null);
    setPreview({ projectId: id, loading: true });
    try {
      const result = await api<OdooSnapshot>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/preview/${id}`);
      setPreview({ projectId: id, snapshot: result, loading: false });
    } catch (previewError) {
      setPreview({ projectId: id, loading: false, error: previewError instanceof Error ? previewError.message : 'Não foi possível consultar esse projeto.' });
    }
  }

  async function confirmLink() {
    if (!preview?.snapshot) return;
    const confirmedProject = preview.snapshot;
    setLinking(true); setError(''); setFeedback(null);
    try {
      const result = await api<{ projectId: number }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/project`, { method: 'PUT', body: JSON.stringify({ projectId: preview.projectId }) });
      setSnapshot(confirmedProject); setProjectId(String(result.projectId));
      setBootstrap((current) => current ? { ...current, projectId: result.projectId } : current);
      setActivityTypeId(String(confirmedProject.activityTypes[0]?.id || ''));
      setLinkEditorOpen(false); setSuggestions([]);
      setFeedback({ tone: 'success', text: `Projeto “${confirmedProject.project.name}” vinculado a esta edificação.` });
      setPreview(null);
    } catch (linkError) { setPreview((current) => current ? { ...current, error: linkError instanceof Error ? linkError.message : 'Não foi possível vincular o projeto.' } : current); }
    finally { setLinking(false); }
  }

  function consultProjectId(event: FormEvent) {
    event.preventDefault();
    const parsed = Number(projectId.trim());
    if (Number.isSafeInteger(parsed) && parsed > 0) void openPreview(parsed);
  }

  async function openLinkEditor() {
    setLinkEditorOpen(true);
    if (!suggestions.length && !suggestionsLoading) await refreshSuggestions();
  }

  async function openActivityModal() {
    setActivityModalOpen(true); setError(''); setFeedback(null);
    if (assignees.length || assigneesLoading) return;
    setAssigneesLoading(true);
    try {
      const result = await api<{ users: OdooAssignee[] }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/assignees`);
      setAssignees(result.users);
      const managerId = Array.isArray(snapshot?.project.manager) ? String(snapshot.project.manager[0]) : '';
      setActivityAssigneeId((current) => result.users.some((item) => String(item.id) === current) ? current : result.users.some((item) => String(item.id) === managerId) ? managerId : String(result.users[0]?.id || ''));
    } catch (assigneeError) { setError(assigneeError instanceof Error ? assigneeError.message : 'Não foi possível carregar os responsáveis da Odoo.'); }
    finally { setAssigneesLoading(false); }
  }

  function addFiles(target: 'note' | 'activity', incoming: File[]) {
    if (!incoming.length) return;
    const setFiles = target === 'note' ? setNoteFiles : setActivityFiles;
    setFiles((current) => {
      const next = [...current, ...incoming];
      const total = next.reduce((sum, file) => sum + file.size, 0);
      if (next.length > 8 || total > 12 * 1024 * 1024) {
        setError('Cada envio aceita até 8 arquivos e 12 MB no total.');
        return current;
      }
      setError('');
      if (target === 'note') noteRequestId.current = null;
      return next;
    });
  }

  function handlePasteImages(target: 'note' | 'activity', event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (!images.length) return;
    event.preventDefault();
    addFiles(target, images.map((file, index) => file.name ? file : new File([file], `imagem-colada-${index + 1}.png`, { type: file.type || 'image/png' })));
  }

  function insertMention(person: OdooPerson) {
    const textarea = noteEditorRef.current;
    const start = textarea?.selectionStart ?? noteBody.length;
    const end = textarea?.selectionEnd ?? start;
    const insertion = `@${person.name} `;
    setNoteBody((current) => {
      const next = `${current.slice(0, start)}${insertion}${current.slice(end)}`;
      requestAnimationFrame(() => { noteEditorRef.current?.focus(); noteEditorRef.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
      return next.slice(0, 5000);
    });
    setSelectedMentions((current) => current.some((item) => item.partnerId === person.partnerId) ? current : [...current, person]);
    noteRequestId.current = null; setMentionOpen(false); setMentionQuery(''); setMentionPeople([]);
  }

  async function sendNote(event: FormEvent) {
    event.preventDefault(); setNoteSending(true); setError(''); setFeedback(null);
    noteRequestId.current ||= crypto.randomUUID();
    try {
      const form = new FormData();
      form.set('body', noteBody.trim()); form.set('requestId', noteRequestId.current); form.set('partnerIds', JSON.stringify(selectedMentions.map((person) => person.partnerId)));
      noteFiles.forEach((file) => form.append('attachments', file, file.name));
      const result = await api<{ alreadyExists: boolean }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/notes`, { method: 'POST', body: form });
      noteRequestId.current = null; setNoteBody(''); setNoteFiles([]); setSelectedMentions([]); setNoteComposerOpen(false); setMentionOpen(false);
      setFeedback({ tone: 'success', text: result.alreadyExists ? 'Esta nota já havia sido registrada no Chatter.' : 'Nota interna publicada no Chatter do projeto.' });
      await refreshProject();
    } catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'Não foi possível publicar a nota.'); }
    finally { setNoteSending(false); }
  }

  async function scheduleActivity(event: FormEvent) {
    event.preventDefault(); setActivitySending(true); setError(''); setFeedback(null);
    try {
      const form = new FormData();
      form.set('activityTypeId', activityTypeId); form.set('assigneeId', activityAssigneeId); form.set('summary', activitySummary.trim()); form.set('note', activityNote.trim()); form.set('deadline', activityDeadline);
      activityFiles.forEach((file) => form.append('attachments', file, file.name));
      await api(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/activities`, { method: 'POST', body: form });
      setActivitySummary(''); setActivityNote(''); setActivityDeadline(localDate()); setActivityFiles([]); setActivityModalOpen(false);
      setFeedback({ tone: 'success', text: 'Atividade planejada no projeto Odoo.' });
      await refreshProject();
    } catch (sendError) { setError(sendError instanceof Error ? sendError.message : 'Não foi possível criar a atividade.'); }
    finally { setActivitySending(false); }
  }

  async function attachDocument(doc: DocumentItem) {
    if (!doc.processId || !doc.kind) return;
    setSendingDocumentId(doc.id); setError(''); setFeedback(null);
    try {
      const result = await api<{ alreadyExists: boolean }>(`/api/buildings/${encodeURIComponent(buildingId)}/odoo/documents`, {
        method: 'POST', body: JSON.stringify({ processId: doc.processId, kind: doc.kind, daeId: doc.daeId || '' })
      });
      setFeedback({ tone: 'success', text: result.alreadyExists ? `${doc.name} já estava anexado ao Chatter.` : `${doc.name} enviado como nota interna e anexo.` });
      await refreshProject();
    } catch (sendError) { setError(sendError instanceof Error ? sendError.message : `Não foi possível anexar ${doc.name}.`); }
    finally { setSendingDocumentId(null); }
  }

  const attachableDocuments = documents.filter((doc) => doc.source === 'fenix' && doc.available && Boolean(doc.processId && doc.kind));
  const addNoteFiles = (event: ChangeEvent<HTMLInputElement>) => { addFiles('note', Array.from(event.target.files || [])); event.target.value = ''; };
  const addActivityFiles = (event: ChangeEvent<HTMLInputElement>) => { addFiles('activity', Array.from(event.target.files || [])); event.target.value = ''; };
  const renderFileChips = (files: File[], target: 'note' | 'activity') => files.length > 0 && <div className="odoo-upload-list">{files.map((file, index) => <span className="odoo-upload-chip" key={`${file.name}-${file.lastModified}-${index}`} title={`${file.name} · ${(file.size / 1024).toFixed(0)} KB`}><FileText size={13} /><b>{file.name}</b><button type="button" aria-label={`Remover ${file.name}`} onClick={() => { const setFiles = target === 'note' ? setNoteFiles : setActivityFiles; setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); if (target === 'note') noteRequestId.current = null; }}><X size={12} /></button></span>)}</div>;

  return <div className="odoo-page">
    <header className="odoo-page-heading"><div><h3>Projeto no Odoo</h3><p>Dados do projeto e conversas do Chatter.</p></div><div className="odoo-heading-actions"><span className={`odoo-connection-state ${bootstrap?.configured && !demo ? 'ready' : ''}`}><i />{demo ? 'Demonstração' : bootstrap?.configured ? 'Configurado' : 'Não configurado'}</span>{bootstrap?.projectId && !demo && <button type="button" className="button button-outline odoo-change-link" onClick={() => linkEditorOpen ? setLinkEditorOpen(false) : void openLinkEditor()}><RefreshCw size={14} />{linkEditorOpen ? 'Fechar busca' : 'Alterar vínculo'}</button>}</div></header>
    {(!demo && bootstrap && !bootstrap.configured) && <div className="odoo-notice"><CircleAlert size={16} /><span>Configure a conexão em <b>Configurações → Integração Odoo</b> para vincular um projeto.</span></div>}
    {demo && <div className="odoo-notice"><CircleAlert size={16} /><span>A integração Odoo está disponível em uma sessão conectada, não na demonstração.</span></div>}
    {(!bootstrap?.projectId || linkEditorOpen) && !demo && bootstrap?.configured && <section className="odoo-link-workbench">
      {bootstrap.projectId && <div className="odoo-current-link"><span>Vínculo atual</span><b>Projeto #{bootstrap.projectId}{snapshot ? ` · ${snapshot.project.name}` : ''}</b></div>}
      <form className="odoo-link-form" onSubmit={consultProjectId}>
        <label htmlFor="odoo-project-id"><span>ID do projeto Odoo</span><small>Informe o ID numérico do registro <code>project.project</code>.</small></label>
        <input id="odoo-project-id" value={projectId} onChange={(event) => setProjectId(event.target.value.replace(/[^\d]/g, '').slice(0, 12))} inputMode="numeric" placeholder="Ex.: 1234" disabled={Boolean(preview?.loading) || linking} required />
        <button className="button button-teal" type="submit" disabled={Boolean(preview?.loading) || linking || !projectId.trim()}>{preview?.loading ? <LoaderCircle size={15} className="spin" /> : <Search size={15} />}{preview?.loading ? 'Consultando…' : 'Consultar'}</button>
      </form>
      <div className="odoo-suggestions-heading"><div><h4>Projetos com cliente semelhante</h4><small>Para “{bootstrap.buildingReference}” · ordenados por aderência estimada.</small></div><button type="button" className="button button-outline" onClick={() => void refreshSuggestions()} disabled={suggestionsLoading}><RefreshCw size={14} className={suggestionsLoading ? 'spin' : ''} />Atualizar</button></div>
      {suggestionsLoading ? <div className="odoo-loading"><LoaderCircle size={17} className="spin" />Buscando projetos…</div>
        : suggestionsError ? <div className="odoo-feedback error" role="alert"><CircleAlert size={15} />{suggestionsError}</div>
          : suggestions.length ? <div className="odoo-suggestion-list">{suggestions.map((item) => <article className="odoo-suggestion" key={item.id}>
            <span className="odoo-suggestion-icon"><Building2 size={17} /></span><div className="odoo-suggestion-main"><b>{item.name}</b><small>Cliente: {relationName(item.customer)} · ID {item.id}</small><small>{relationName(item.stage)} · {item.openTaskCount} de {item.taskCount} tarefa(s) em aberto</small></div><span className="odoo-match-score">{item.matchScore}%<small>aderência</small></span><button type="button" className="button button-outline odoo-suggestion-link" onClick={() => void openPreview(item.id)} disabled={Boolean(preview?.loading) || linking}>Vincular</button>
          </article>)}</div>
          : <div className="odoo-empty">Não encontramos projetos semelhantes. Você pode consultar diretamente pelo ID.</div>}
    </section>}
    {error && <div className="odoo-feedback error" role="alert"><CircleAlert size={15} />{error}</div>}
    {feedback && <div className={`odoo-feedback ${feedback.tone}`} role="status"><Check size={15} />{feedback.text}</div>}
    {loading && <div className="odoo-loading"><LoaderCircle size={18} className="spin" />Carregando integração…</div>}
    {!loading && snapshot && <div className="odoo-workspace">
      <main className="odoo-project-column">
        <section className="odoo-project-overview">
          <header className="odoo-project-heading"><span className="odoo-project-icon"><Building2 size={20} /></span><div className="odoo-project-name"><small>PROJETO #{snapshot.project.id}</small><h4>{snapshot.project.name}</h4></div><span className="odoo-stage-pill">{relationName(snapshot.project.stage)}</span><button className="button button-outline odoo-refresh" type="button" onClick={() => void refreshProject()} disabled={refreshing} aria-label="Atualizar dados do projeto" title="Atualizar dados do projeto">{refreshing ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}</button></header>
          <div className="odoo-project-facts"><div><small>CLIENTE</small><b>{relationName(snapshot.project.customer)}</b></div><div><small>RESPONSÁVEL</small><b>{relationName(snapshot.project.manager)}</b></div><div><small>INÍCIO</small><b>{dateOnly(snapshot.project.startDate)}</b></div><div><small>ENCERRAMENTO</small><b>{dateOnly(snapshot.project.endDate)}</b></div></div>
          <div className="odoo-project-counts"><span><b>{snapshot.project.taskCount}</b> tarefas</span><span><b>{snapshot.project.openTaskCount}</b> em andamento</span><span>Atualizado em <b>{dateOnly(snapshot.project.updatedAt)}</b></span></div>
          {snapshot.project.description && <p className="odoo-project-description">{snapshot.project.description}</p>}
        </section>
        <section className="odoo-project-section"><header><h4>Tarefas</h4><span>{snapshot.tasks.length} recentes</span></header>
          {snapshot.tasks.length ? <div className="odoo-task-list">{snapshot.tasks.map((task) => <article className="odoo-task-row" key={task.id}><div><b>{task.name}</b><small>{relationName(task.stage)} · {relationName(task.assignees)}</small></div><time>{dateOnly(task.deadline)}</time></article>)}</div> : <div className="odoo-empty">Nenhuma tarefa foi retornada para este projeto.</div>}
        </section>
        <section className="odoo-project-section odoo-fenix-documents"><header><div><h4>Documentos do Fênix</h4><small>Anexe documentos oficiais ao Chatter do projeto.</small></div><span>{attachableDocuments.length}</span></header>
          {attachableDocuments.length ? <div className="odoo-document-list">{attachableDocuments.map((doc) => <article className="odoo-document-row" key={doc.id}><span className="odoo-document-icon"><FileText size={16} /></span><div><b>{doc.name}</b><small>{doc.type}{doc.date ? ` · ${dateOnly(doc.date)}` : ''}</small></div><button type="button" className="button button-outline" onClick={() => void attachDocument(doc)} disabled={Boolean(sendingDocumentId)}>{sendingDocumentId === doc.id ? <LoaderCircle size={14} className="spin" /> : <Paperclip size={14} />}{sendingDocumentId === doc.id ? 'Enviando…' : 'Anexar'}</button></article>)}</div> : <div className="odoo-empty">Não há documentos oficiais disponíveis para esta edificação.</div>}
        </section>
      </main>
      <aside className="odoo-chatter-panel">
        <header className="odoo-chatter-heading"><div><h4>Chatter</h4><small>{snapshot.messages.length} mensagens recentes</small></div><button type="button" className="icon-button" onClick={() => void refreshProject()} disabled={refreshing} aria-label="Atualizar Chatter" title="Atualizar Chatter">{refreshing ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}</button></header>
        <div className="odoo-chatter-actions"><button type="button" className={`odoo-chatter-action ${noteComposerOpen ? 'selected' : ''}`} onClick={() => setNoteComposerOpen((open) => !open)}><MessageCircle size={15} />Notas Internas</button><button type="button" className="odoo-chatter-action" onClick={() => void openActivityModal()}><Activity size={15} />Atividade</button></div>
        {noteComposerOpen && <form className="odoo-note-composer" onSubmit={sendNote}>
          <textarea ref={noteEditorRef} id="odoo-note-body" value={noteBody} onChange={(event) => { noteRequestId.current = null; setNoteBody(event.target.value.slice(0, 5000)); }} onPaste={(event) => handlePasteImages('note', event)} rows={3} maxLength={5000} placeholder="Registrar uma nota interna…" aria-label="Texto da nota interna" disabled={noteSending} />
          {selectedMentions.length > 0 && <div className="odoo-mention-chips">{selectedMentions.map((person) => <span className="odoo-mention-chip" key={person.partnerId}>@{person.name}<button type="button" aria-label={`Remover menção a ${person.name}`} onClick={() => { setSelectedMentions((current) => current.filter((item) => item.partnerId !== person.partnerId)); noteRequestId.current = null; }}><X size={11} /></button></span>)}</div>}
          {renderFileChips(noteFiles, 'note')}
          {mentionOpen && <div className="odoo-mention-picker"><label htmlFor="odoo-mention-search"><AtSign size={14} /><input id="odoo-mention-search" value={mentionQuery} onChange={(event) => setMentionQuery(event.target.value)} placeholder="Buscar pessoas da Odoo" autoFocus /></label>{mentionsLoading ? <small className="odoo-picker-hint">Buscando pessoas…</small> : mentionQuery.trim().length < 2 ? <small className="odoo-picker-hint">Digite pelo menos 2 caracteres.</small> : mentionPeople.length ? <div className="odoo-mention-results">{mentionPeople.map((person) => <button type="button" key={person.partnerId} onClick={() => insertMention(person)}><UserRound size={15} /><span>{person.name}</span><Plus size={14} /></button>)}</div> : <small className="odoo-picker-hint">Nenhuma pessoa encontrada.</small>}</div>}
          <input ref={noteFileInputRef} className="odoo-hidden-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={addNoteFiles} />
          <div className="odoo-composer-footer"><span>{noteBody.length}/5.000 · Ctrl+V cola imagens</span><div><button type="button" className={`odoo-tool-button ${mentionOpen ? 'selected' : ''}`} onClick={() => setMentionOpen((open) => !open)} aria-expanded={mentionOpen}><AtSign size={15} />Mencionar</button><button type="button" className="odoo-tool-button" onClick={() => noteFileInputRef.current?.click()}><Paperclip size={15} />Anexar</button><button type="submit" className="button button-teal" disabled={noteSending || (!noteBody.trim() && noteFiles.length === 0)}>{noteSending ? <LoaderCircle size={14} className="spin" /> : <Send size={14} />}{noteSending ? 'Publicando…' : 'Registrar'}</button></div></div>
        </form>}
        <div className="odoo-chatter-feed">
          <section className="odoo-chat-activities"><header><h5>Atividades planejadas</h5><span>{snapshot.activities.length}</span></header>{snapshot.activities.length ? snapshot.activities.map((activity) => <article className="odoo-chat-activity" key={activity.id}><span className="odoo-activity-mark"><Activity size={14} /></span><div><b>{activity.summary || relationName(activity.type)}</b><small>{relationName(activity.type)} · {relationName(activity.assignee)}</small>{activity.note && <p>{activity.note}</p>}<time>{dateOnly(activity.deadline)}</time></div></article>) : <div className="odoo-empty compact">Nenhuma atividade em aberto.</div>}</section>
          <section className="odoo-chat-messages"><header><h5>Mensagens e notas</h5></header>{snapshot.messages.length ? snapshot.messages.map((message) => <article className="odoo-chat-message" key={message.id}><span className="odoo-chat-avatar">{relationName(message.author).slice(0, 1).toUpperCase()}</span><div className="odoo-chat-message-body"><div className="odoo-message-meta"><b className={isInternalNote(message) ? 'internal' : ''}>{isInternalNote(message) ? 'Nota interna' : message.subject || 'Mensagem'}</b><span>{relationName(message.author)}</span></div><p>{message.body || (message.attachmentIds.length ? 'Anexo enviado ao Chatter' : 'Sem texto')}</p>{message.attachmentIds.length > 0 && <small className="odoo-attachment-count"><Paperclip size={12} />{message.attachmentIds.length} anexo(s)</small>}<time>{messageDate(message.date)}</time></div></article>) : <div className="odoo-empty compact">O projeto ainda não tem mensagens no Chatter.</div>}</section>
        </div>
      </aside>
    </div>}
    {preview && createPortal(<div className="odoo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !linking) setPreview(null); }}><section className="odoo-preview-modal" role="dialog" aria-modal="true" aria-labelledby="odoo-preview-title">
      <header><div><h3 id="odoo-preview-title">Confirmar vínculo com a Odoo</h3></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => { if (!linking) setPreview(null); }} disabled={linking}><X size={18} /></button></header>
      <div className="odoo-preview-body">
        {preview.loading && <div className="odoo-loading"><LoaderCircle size={18} className="spin" />Consultando o projeto {preview.projectId}…</div>}
        {!preview.loading && preview.snapshot && <div className="odoo-preview-content">
          {preview.error && <div className="odoo-feedback error" role="alert"><CircleAlert size={15} />{preview.error}</div>}
          <p>Este projeto será vinculado à edificação <b>{bootstrap?.buildingReference}</b>.</p>
          <div className="odoo-preview-project"><span className="odoo-project-icon"><FileText size={19} /></span><div><small>PROJETO #{preview.snapshot.project.id}</small><h4>{preview.snapshot.project.name}</h4></div></div>
          <div className="odoo-project-facts"><div><small>CLIENTE</small><b>{relationName(preview.snapshot.project.customer)}</b></div><div><small>ETAPA</small><b>{relationName(preview.snapshot.project.stage)}</b></div><div><small>RESPONSÁVEL</small><b>{relationName(preview.snapshot.project.manager)}</b></div><div><small>TAREFAS ABERTAS</small><b>{preview.snapshot.project.openTaskCount} de {preview.snapshot.project.taskCount}</b></div></div>
          {preview.snapshot.project.description && <p className="odoo-project-description">{preview.snapshot.project.description}</p>}
        </div>}
        {!preview.loading && !preview.snapshot && preview.error && <div className="odoo-feedback error" role="alert"><CircleAlert size={15} />{preview.error}</div>}
      </div>
      <footer><button type="button" className="button button-outline" onClick={() => setPreview(null)} disabled={linking}>Cancelar</button><button type="button" className="button button-teal" onClick={() => void confirmLink()} disabled={!preview.snapshot || preview.loading || linking}>{linking ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{linking ? 'Vinculando…' : 'Vincular'}</button></footer>
    </section></div>, document.body)}
    {activityModalOpen && createPortal(<div className="odoo-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !activitySending) setActivityModalOpen(false); }}><form className="odoo-activity-modal" role="dialog" aria-modal="true" aria-labelledby="odoo-activity-title" onSubmit={scheduleActivity}>
      <header><div><h3 id="odoo-activity-title">Agendar atividade</h3><p>Defina o responsável, o prazo e as informações que aparecerão no projeto.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={() => { if (!activitySending) setActivityModalOpen(false); }} disabled={activitySending}><X size={18} /></button></header>
      <div className="odoo-activity-modal-body">
        <div className="odoo-activity-field-grid"><label>Tipo<select id="odoo-activity-type" value={activityTypeId} onChange={(event) => setActivityTypeId(event.target.value)} required disabled={!snapshot?.activityTypes.length}><option value="">{snapshot?.activityTypes.length ? 'Selecione o tipo' : 'Nenhum tipo disponível'}</option>{snapshot?.activityTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label><label>Para<select id="odoo-activity-assignee" value={activityAssigneeId} onChange={(event) => setActivityAssigneeId(event.target.value)} required disabled={assigneesLoading || !assignees.length}><option value="">{assigneesLoading ? 'Carregando pessoas…' : 'Selecione quem receberá'}</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div>
        <div className="odoo-activity-field-grid"><label>Resumo<input id="odoo-activity-summary" value={activitySummary} onChange={(event) => setActivitySummary(event.target.value.slice(0, 120))} maxLength={120} placeholder="Ex.: Conferir documentação recebida" required /></label><label>Vencimento<span className="odoo-date-field"><CalendarDays size={15} /><input type="date" value={activityDeadline} onChange={(event) => setActivityDeadline(event.target.value)} required /></span></label></div>
        <label className="odoo-note-field">Registrar uma nota<textarea value={activityNote} onChange={(event) => setActivityNote(event.target.value.slice(0, 5000))} onPaste={(event) => handlePasteImages('activity', event)} maxLength={5000} rows={5} placeholder="Adicione detalhes para a pessoa responsável…" /></label>
        {renderFileChips(activityFiles, 'activity')}
        <input ref={activityFileInputRef} className="odoo-hidden-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={addActivityFiles} />
        <div className="odoo-activity-attachments"><button type="button" className="odoo-tool-button" onClick={() => activityFileInputRef.current?.click()}><Paperclip size={15} />Anexar documentos ou imagens</button><span>{activityNote.length}/5.000 · Ctrl+V cola imagens</span></div>
      </div>
      <footer><button type="button" className="button button-outline" onClick={() => setActivityModalOpen(false)} disabled={activitySending}>Cancelar</button><button type="submit" className="button button-teal" disabled={activitySending || assigneesLoading || !activityTypeId || !activityAssigneeId || activitySummary.trim().length < 2}>{activitySending ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{activitySending ? 'Salvando…' : 'Salvar'}</button></footer>
    </form></div>, document.body)}
  </div>;
}
