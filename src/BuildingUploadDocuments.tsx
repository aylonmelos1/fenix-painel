import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownToLine, CircleAlert, FileText, LoaderCircle, LockKeyhole, Send, Trash2, UploadCloud } from 'lucide-react';
import { api, formatDate, type ProcessDetail } from './types';

type BuildingDocument = {
  id: string;
  name: string;
  categoryKey: string;
  categoryLabel: string;
  mimetype: string;
  sizeBytes: number;
  targetProcessId: string | null;
  targetProcessProtocol: string | null;
  targetProcessType: string | null;
  sendStatus: 'awaiting_contract' | string;
  createdAt: string;
};

const categories = [
  ['responsabilidade_tecnica', 'Responsabilidade técnica (ART, RRT ou TRT)'],
  ['formulario_seguranca', 'Formulário de Segurança (Anexo D)'],
  ['planta_baixa', 'Planta baixa'],
  ['outros', 'Outros documentos'],
  ['nao_classificado', 'Não classificado']
] as const;

const acceptedFiles = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.dwg,.dxf';
const acceptedFileExtensions = new Set(acceptedFiles.split(','));
const maxFilesPerUpload = 8;
const maxUploadBytes = 12 * 1024 * 1024;

function formatBytes(value: number) {
  if (value === 0) return '0 B';
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
}

function validateFileSelection(files: File[]) {
  if (files.length > maxFilesPerUpload) return `Selecione no máximo ${maxFilesPerUpload} arquivos por envio.`;
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > maxUploadBytes) return `Os arquivos podem somar até ${formatBytes(maxUploadBytes)} por envio.`;
  const unsupportedFiles = files.filter((file) => {
    const extension = file.name.match(/\.[a-z0-9]{1,10}$/i)?.[0].toLowerCase();
    return !extension || !acceptedFileExtensions.has(extension);
  });
  if (unsupportedFiles.length) return `Formato não permitido: ${unsupportedFiles.map((file) => file.name).join(', ')}. Use PDF, imagem, Office, DWG ou DXF.`;
  if (files.some((file) => file.size === 0)) return 'Remova arquivos vazios antes de guardar no Painel.';
  return '';
}

type UploadContext = { key: string; label: string; method: string; pathTemplate: string; fileField: string; fields: Array<{ key: string; description: string }>; requiredIds: string[]; limits: string };
type UploadPlan = { endpoint: string; fields: Array<{ key: string; value: string }>; fileField: string; blocked: boolean; blockReason: string; sendEnabled: boolean };

export function BuildingUploadDocuments({ buildingId, processes, demo }: { buildingId: string; processes: ProcessDetail[]; demo: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef('');
  const [sendEnabled, setSendEnabled] = useState(false);
  const [uploadContexts, setUploadContexts] = useState<UploadContext[]>([]);
  const [planDocId, setPlanDocId] = useState('');
  const [planContext, setPlanContext] = useState('projeto_tecnico');
  const [planTipo, setPlanTipo] = useState('');
  const [planSolicitacao, setPlanSolicitacao] = useState('');
  const [planProjeto, setPlanProjeto] = useState('');
  const [planRetificacao, setPlanRetificacao] = useState('');
  const [planRemanejamento, setPlanRemanejamento] = useState('');
  const [planResult, setPlanResult] = useState<UploadPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [documents, setDocuments] = useState<BuildingDocument[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState<string>('nao_classificado');
  const [targetProcessId, setTargetProcessId] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selectedBytes = files.reduce((total, file) => total + file.size, 0);
  const selectionError = validateFileSelection(files);

  useEffect(() => {
    let current = true;
    idempotencyKeyRef.current = '';
    setFiles([]);
    setTargetProcessId('');
    if (inputRef.current) inputRef.current.value = '';
    setLoading(true);
    setError('');
    api<{ documents: BuildingDocument[] }>(`/api/buildings/${encodeURIComponent(buildingId)}/documents`)
      .then((result) => { if (current) setDocuments(result.documents || []); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os arquivos locais.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [buildingId]);

  useEffect(() => {
    let current = true;
    api<{ sendEnabled: boolean; contexts: UploadContext[] }>('/api/fenix/uploads/contexts')
      .then((result) => { if (current) { setSendEnabled(Boolean(result.sendEnabled)); setUploadContexts(result.contexts || []); } })
      .catch(() => { if (current) { setSendEnabled(false); setUploadContexts([]); } });
    return () => { current = false; };
  }, []);

  async function previewSendPlan() {
    if (!planDocId || !planTipo.trim() || planLoading) return;
    setPlanLoading(true); setPlanError(''); setPlanResult(null);
    try {
      const result = await api<UploadPlan>(`/api/buildings/${encodeURIComponent(buildingId)}/documents/${encodeURIComponent(planDocId)}/send-plan`, {
        method: 'POST', body: JSON.stringify({
          context: planContext, tipoDocumento: planTipo.trim(),
          solicitacaoId: planSolicitacao.trim() || undefined, projetoTecnicoId: planProjeto.trim() || undefined,
          retificacaoId: planRetificacao.trim() || undefined, remanejamentoId: planRemanejamento.trim() || undefined,
        })
      });
      setPlanResult(result);
    } catch (reason) {
      setPlanError(reason instanceof Error ? reason.message : 'Não foi possível montar o plano de envio.');
    } finally { setPlanLoading(false); }
  }

  async function uploadFiles(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!files.length || demo || uploading) return;
    if (selectionError) return;
    setUploading(true); setError(''); setNotice('');
    const form = new FormData();
    form.append('category', category);
    if (targetProcessId) form.append('targetProcessId', targetProcessId);
    files.forEach((file) => form.append('files', file, file.name));
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    try {
      const result = await api<{ documents: BuildingDocument[]; replayed?: boolean }>(`/api/buildings/${encodeURIComponent(buildingId)}/documents`, {
        method: 'POST', body: form, headers: { 'Idempotency-Key': idempotencyKeyRef.current }
      });
      setDocuments(result.documents || []);
      setFiles([]);
      idempotencyKeyRef.current = '';
      if (inputRef.current) inputRef.current.value = '';
      setNotice(result.replayed
        ? 'O Painel confirmou que este mesmo lote já estava guardado. Nenhum arquivo foi enviado ao CBMBA.'
        : 'Arquivos guardados no Painel. Nenhum arquivo foi enviado ao CBMBA.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível guardar os arquivos.');
    } finally { setUploading(false); }
  }

  async function removeDocument(document: BuildingDocument) {
    if (demo || deletingId) return;
    if (!window.confirm(`Remover “${document.name}” do armazenamento do Painel?`)) return;
    setDeletingId(document.id); setError(''); setNotice('');
    try {
      await api(`/api/buildings/${encodeURIComponent(buildingId)}/documents/${encodeURIComponent(document.id)}`, { method: 'DELETE' });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setNotice('Arquivo removido do Painel.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível remover o arquivo.');
    } finally { setDeletingId(''); }
  }

  return <section className="building-upload-card">
    <header className="building-upload-heading">
      <div><span className="section-kicker">ARQUIVOS DA EDIFICAÇÃO</span><h4>Documentos guardados no Painel <span className="doc-count">{documents.length}</span></h4><small>O arquivo fica armazenado aqui primeiro; nada é enviado ao CBMBA automaticamente.</small></div>
      <LockKeyhole size={18} aria-hidden="true" />
    </header>

    <form className="building-upload-form" onSubmit={(event) => void uploadFiles(event)}>
      <div className="building-upload-fields">
        <label>Categoria local
          <select value={category} onChange={(event) => { idempotencyKeyRef.current = ''; setCategory(event.target.value); }} disabled={demo || uploading}>
            {categories.map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select>
        </label>
        <label>Processo relacionado <small>Opcional</small>
          <select value={targetProcessId} onChange={(event) => { idempotencyKeyRef.current = ''; setTargetProcessId(event.target.value); }} disabled={demo || uploading}>
            <option value="">Ainda sem processo</option>
            {processes.map((process) => <option value={process.id} key={process.id}>{process.protocol || process.type} · {process.type}</option>)}
          </select>
        </label>
      </div>
      <label className="building-file-picker">
        <UploadCloud size={19} />
        <span><b>Escolher arquivos</b><small>PDF, imagens, Office, DWG ou DXF · até {maxFilesPerUpload} arquivos e {formatBytes(maxUploadBytes)} por envio</small></span>
        <input ref={inputRef} type="file" accept={acceptedFiles} multiple disabled={demo || uploading} onChange={(event) => { idempotencyKeyRef.current = ''; setFiles(Array.from(event.currentTarget.files || [])); setError(''); setNotice(''); }} />
      </label>
      {files.length > 0 && <div className="building-selected-files" aria-label="Arquivos selecionados">
        {files.map((file, index) => <span key={`${file.name}-${file.lastModified}-${index}`} title={file.name}><FileText size={14} /><b>{file.name}</b><small>{formatBytes(file.size)}</small><button type="button" aria-label={`Remover ${file.name} da seleção`} onClick={() => { idempotencyKeyRef.current = ''; setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index)); if (inputRef.current) inputRef.current.value = ''; }}>×</button></span>)}
      </div>}
      {files.length > 0 && <div className={`building-upload-selection-summary ${selectionError ? 'invalid' : ''}`} aria-live="polite"><span>{files.length} arquivo{files.length === 1 ? '' : 's'} selecionado{files.length === 1 ? '' : 's'} · {formatBytes(selectedBytes)} de {formatBytes(maxUploadBytes)}</span>{selectionError && <span role="alert">{selectionError}</span>}</div>}
      <div className="building-upload-actions"><small>As categorias são etiquetas internas. O vínculo com os tipos oficiais do Fênix ainda precisa de confirmação.</small><button className="button button-teal" type="submit" title={selectionError || undefined} disabled={demo || uploading || files.length === 0 || Boolean(selectionError)}><UploadCloud size={15} />{uploading ? 'Guardando…' : 'Guardar no Painel'}</button></div>
      {demo && <p className="building-upload-message" role="status">O armazenamento de documentos está disponível nas contas conectadas.</p>}
    </form>

    <div className="building-upload-send-note"><CircleAlert size={16} /><span><b>Envio aos bombeiros em etapa separada</b><small>O Fênix ainda não teve a rota multipart e os IDs dos tipos documentais confirmados. O envio externo permanece bloqueado até validar esses dados.</small></span></div>
    {sendEnabled && !demo && documents.length > 0 && <details className="building-upload-plan">
      <summary>Plano de envio por contexto (bloqueado — só mostra os campos exatos)</summary>
      <div className="building-upload-fields">
        <label>Arquivo guardado
          <select value={planDocId} onChange={(event) => setPlanDocId(event.target.value)}>
            <option value="">Escolher…</option>
            {documents.map((document) => <option value={document.id} key={document.id}>{document.name}</option>)}
          </select>
        </label>
        <label>Contexto do Fênix
          <select value={planContext} onChange={(event) => { setPlanContext(event.target.value); setPlanResult(null); }}>
            {uploadContexts.map((item) => <option value={item.key} key={item.key}>{item.label} — POST {item.pathTemplate}</option>)}
          </select>
        </label>
      </div>
      <div className="building-upload-fields">
        <label>Tipo documental oficial
          <input value={planTipo} onChange={(event) => setPlanTipo(event.target.value)} placeholder="Ex.: ART, vinculo_processo" maxLength={120} />
        </label>
        <label>Solicitação ID
          <input value={planSolicitacao} onChange={(event) => setPlanSolicitacao(event.target.value)} placeholder="Somente números" inputMode="numeric" maxLength={12} />
        </label>
      </div>
      <div className="building-upload-fields">
        <label>Projeto técnico ID
          <input value={planProjeto} onChange={(event) => setPlanProjeto(event.target.value)} placeholder="Somente números" inputMode="numeric" maxLength={12} />
        </label>
        <label>Retificação ID
          <input value={planRetificacao} onChange={(event) => setPlanRetificacao(event.target.value)} placeholder="Somente números" inputMode="numeric" maxLength={12} />
        </label>
        <label>Remanejamento ID
          <input value={planRemanejamento} onChange={(event) => setPlanRemanejamento(event.target.value)} placeholder="Somente números" inputMode="numeric" maxLength={12} />
        </label>
      </div>
      <div className="building-upload-actions">
        <small>Nenhum byte sai do Painel nesta etapa. O botão de envio segue bloqueado.</small>
        <button className="button button-outline" type="button" disabled={!planDocId || !planTipo.trim() || planLoading} onClick={() => void previewSendPlan()}>{planLoading ? 'Montando…' : 'Ver plano de envio'}</button>
      </div>
      {planError && <div className="building-upload-message error" role="alert"><CircleAlert size={15} />{planError}</div>}
      {planResult && <div className="building-upload-message" role="status">
        <b>POST {planResult.endpoint}</b>
        <small>{planResult.fields.map((field) => `${field.key}=${field.value}`).join(' · ')}</small>
        <small>{planResult.blockReason}</small>
        <button className="button button-outline building-send-button" type="button" disabled title={planResult.blockReason}><Send size={14} />Enviar ao CBMBA</button>
      </div>}
    </details>}
    {error && <div className="building-upload-message error" role="alert"><CircleAlert size={15} />{error}</div>}
    {notice && <div className="building-upload-message" role="status">{notice}</div>}

    <div className="building-upload-list-heading"><b>Arquivos desta edificação</b>{loading && <LoaderCircle size={15} className="spin" />}</div>
    {loading ? <div className="documents-empty">Carregando arquivos locais…</div> : documents.length ? <div className="building-upload-list">
      {documents.map((document) => <article className="building-upload-row" key={document.id}>
        <span className="building-upload-file-icon"><FileText size={18} /></span>
        <span className="building-upload-file-info"><b title={document.name}>{document.name}</b><small>{document.categoryLabel} · {formatBytes(document.sizeBytes)} · {formatDate(document.createdAt)}</small><small>{document.targetProcessProtocol ? `Processo ${document.targetProcessProtocol} · ` : 'Sem processo relacionado · '}Ainda não enviado</small></span>
        <div className="building-upload-row-actions">
          <button className="button button-outline building-send-button" type="button" disabled title="Envio bloqueado até confirmar no Fênix a rota multipart e o ID do tipo documental"><Send size={14} />Enviar ao CBMBA</button>
          <a className="icon-button doc-download" href={`/api/buildings/${encodeURIComponent(buildingId)}/documents/${encodeURIComponent(document.id)}/download`} title={`Baixar ${document.name}`} aria-label={`Baixar ${document.name}`}><ArrowDownToLine size={16} /></a>
          <button className="icon-button doc-download" type="button" disabled={demo || deletingId === document.id} title={`Remover ${document.name}`} aria-label={`Remover ${document.name}`} onClick={() => void removeDocument(document)}>{deletingId === document.id ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}</button>
        </div>
      </article>)}
    </div> : <div className="documents-empty"><FileText size={17} /> Nenhum arquivo guardado para esta edificação.</div>}
  </section>;
}
