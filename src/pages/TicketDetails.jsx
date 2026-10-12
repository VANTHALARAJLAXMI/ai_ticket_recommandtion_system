import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import PriorityBadge from '../components/PriorityBadge.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useTicket } from '../hooks/useTickets.js';
import { PRIORITIES } from '../lib/constants.js';
import { firstRelation, formatDateTime, roleLabel } from '../lib/format.js';
import { isResolutionOverdue } from '../lib/stats.js';
import { allowedProgressTargets, canAssignTicket, validateAttachment, validateComment } from '../lib/validators.js';
import { listActivity, listSlaTargets } from '../services/activityService.js';
import { analyzeTicket } from '../services/aiService.js';
import { listAttachments, openAttachment, uploadAttachment } from '../services/attachmentService.js';
import { addComment, listComments } from '../services/commentService.js';
import { getFeedback, saveFeedback } from '../services/feedbackService.js';
import { articlesForCategory } from '../services/knowledgeService.js';
import { AssignSelect, StatusSelect } from '../components/TicketWorkflow.jsx';
import {
  assignTicket,
  listCategories,
  listStaff,
  reopenTicket,
  resolveTicket,
  updateTicketCategory,
  updateTicketPriority,
  updateTicketProgress,
} from '../services/ticketService.js';

export default function TicketDetails() {
  const { id } = useParams();
  const location = useLocation();
  const { user, role } = useAuth();
  const { ticket, loading, error, reload } = useTicket(id);
  const pushToast = useToast();
  const staff = role === 'agent' || role === 'admin';
  const [comments, setComments] = useState([]);
  const [commentError, setCommentError] = useState('');
  const [articles, setArticles] = useState([]);
  const [articleNote, setArticleNote] = useState('');
  const [activity, setActivity] = useState([]);
  const [activityError, setActivityError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [feedbackError, setFeedbackError] = useState('');
  const actionLock = useRef(false);
  const [rating, setRating] = useState('5');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [slaTargets, setSlaTargets] = useState([]);
  const [slaSource, setSlaSource] = useState('builtin');
  const [analyzing, setAnalyzing] = useState(false);
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(location.state?.notice || '');
  const [warning, setWarning] = useState(location.state?.warning || '');

  async function loadRelated(current) {
    const [commentResult, articleResult, activityResult, attachmentResult, feedbackResult, slaResult] = await Promise.all([
      listComments(current.id),
      articlesForCategory(current.category),
      listActivity(current.id),
      listAttachments(current.id),
      getFeedback(current.id),
      listSlaTargets(),
    ]);
    setComments(commentResult.comments);
    setCommentError(commentResult.error || '');
    setArticles(articleResult.articles);
    setArticleNote(articleResult.error || '');
    setActivity(activityResult.activity);
    setActivityError(activityResult.error || '');
    setAttachments(attachmentResult.attachments);
    setAttachmentError(attachmentResult.error || '');
    setFeedback(feedbackResult.feedback);
    setFeedbackError(feedbackResult.error || '');
    if (feedbackResult.feedback) {
      setRating(String(feedbackResult.feedback.rating));
      setFeedbackComment(feedbackResult.feedback.comment || '');
    }
    setSlaTargets(slaResult.targets);
    setSlaSource(slaResult.source || 'builtin');
  }

  useEffect(() => {
    if (!ticket) return undefined;
    let active = true;
    loadRelated(ticket);
    if (staff) {
      listStaff().then((result) => active && setStaffList(result.staff));
      listCategories().then((result) => active && setCategories(result.categories.map((category) => category.name)));
    }
    return () => {
      active = false;
    };
  }, [ticket, staff]);

  async function refresh() {
    await reload();
    if (ticket) await loadRelated(ticket);
  }

  async function run(action, success) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      const result = await action();
      if (result?.error) {
        pushToast(result.error, 'error');
        return;
      }
      pushToast(success, 'success');
      await refresh();
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    const result = await analyzeTicket(ticket.id);
    setAnalyzing(false);
    if (!result.ok) {
      pushToast(result.message, 'error');
      return;
    }
    pushToast('AI analysis saved.', 'success');
    await reload();
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const result = await saveFeedback(ticket.id, rating, feedbackComment);
    if (result.error) {
      setFeedbackError(result.error);
      return;
    }
    setFeedbackError('');
    pushToast('Feedback saved.', 'success');
    const loaded = await getFeedback(ticket.id);
    setFeedback(loaded.feedback);
  }

  async function submitAttachment(event) {
    event.preventDefault();
    const file = event.target.elements.attachment.files[0];
    const invalid = validateAttachment(file);
    if (invalid) {
      setAttachmentError(invalid);
      return;
    }
    setBusy(true);
    const result = await uploadAttachment(ticket.id, file);
    setBusy(false);
    if (result.error) {
      setAttachmentError(result.error);
      return;
    }
    setAttachmentError('');
    event.target.reset();
    pushToast('File attached.', 'success');
    const loaded = await listAttachments(ticket.id);
    setAttachments(loaded.attachments);
    setAttachmentError(loaded.error || '');
  }

  async function submitComment(event) {
    event.preventDefault();
    const validated = validateComment(body);
    if (!validated.ok) {
      setCommentError(validated.error);
      return;
    }
    await run(() => addComment(ticket.id, validated.value, staff && internal), 'Comment posted.');
    setBody('');
    setInternal(false);
  }

  if (loading) return <LoadingSpinner label="Loading ticket" />;
  if (error || !ticket) return <EmptyState title="Ticket unavailable" message={error || 'This ticket could not be loaded.'} />;

  const isOwner = ticket.user_id === user.id;
  const isAssignee = ticket.assigned_to === user.id;
  const solved = ticket.status === 'Closed' || ticket.status === 'Resolved';
  const progressTargets = allowedProgressTargets(ticket.status);
  const mayAssign = canAssignTicket(role);
  const mayReopen = (role === 'admin' || isAssignee) && (ticket.status === 'Closed' || ticket.status === 'Resolved');
  const solver = [...activity].reverse().find((event) => (
    event.event_type === 'status_changed' && (event.to_value === 'Resolved' || event.to_value === 'Closed')
  ));
  const resolverName = firstRelation(ticket.resolver)?.full_name || firstRelation(solver?.actor)?.full_name || '';
  const assignerName = firstRelation(ticket.assigner)?.full_name || '';
  const agents = staffList.filter((person) => person.role === 'agent');

  return (
    <section className="page">
      {banner ? <div className="banner banner-ok">{banner}</div> : null}
      {warning ? <div className="banner">{warning}</div> : null}
      <header className="page-header">
        <div>
          <p className="ticket-number">{ticket.ticket_number}</p>
          <h1>{ticket.title}</h1>
        </div>
        <div className="row">
          <PriorityBadge priority={ticket.priority} />
          <StatusBadge status={ticket.status} />
          {isResolutionOverdue(ticket, slaTargets) ? <span className="badge badge-overdue">Overdue</span> : null}
        </div>
      </header>
      <div className="detail-grid">
        <div className="detail-main card">
          <p className="description">{ticket.description}</p>
          <dl className="meta-list">
            <dt>Category</dt><dd>{ticket.category}</dd>
            <dt>Impact</dt><dd>{ticket.business_impact}</dd>
            <dt>Urgency</dt><dd>{ticket.urgency}</dd>
            <dt>Affected system</dt><dd>{ticket.affected_system || 'Not specified'}</dd>
            <dt>Opened by</dt><dd>{ticket.owner?.full_name || 'Employee'}</dd>
            <dt>Assigned by</dt><dd>{assignerName || 'Not recorded'}</dd>
            <dt>Handled by</dt><dd>{ticket.assignee?.full_name || 'Unassigned'}</dd>
            {solved ? <><dt>Resolved by</dt><dd>{resolverName || 'Not recorded'}</dd><dt>Resolved at</dt><dd>{formatDateTime(ticket.resolved_at)}</dd></> : null}
            <dt>Created</dt><dd>{formatDateTime(ticket.created_at)}</dd>
            <dt>Updated</dt><dd>{formatDateTime(ticket.updated_at)}</dd>
            <dt>Resolution target</dt>
            <dd>{slaSource === 'database' ? 'From SLA settings' : 'Built-in target until SLA settings are applied'}</dd>
          </dl>
          {ticket.resolution_notes ? (
            <div>
              <h2>Resolution notes</h2>
              <p className="description">{ticket.resolution_notes}</p>
            </div>
          ) : null}
          <section className="stack">
            <h2>Conversation</h2>
            {commentError ? <div className="banner banner-error">{commentError}</div> : null}
            {comments.length === 0 ? <p className="muted">No public replies yet.</p> : null}
            {comments.map((comment) => (
              <article key={comment.id} className="comment">
                <header>
                  <strong>{comment.author?.full_name || 'Teammate'} · {roleLabel(comment.author?.role)}</strong>
                  <div className="row">
                    {comment.is_internal ? <span className="badge badge-internal">Internal note</span> : null}
                    <time>{formatDateTime(comment.created_at)}</time>
                  </div>
                </header>
                <p className="description">{comment.body}</p>
              </article>
            ))}
            {ticket.status === 'Closed' && !staff ? <p className="muted">Closed tickets cannot receive new employee comments.</p> : (
              <form className="stack" onSubmit={submitComment}>
                <label className="field">
                  <span className="field-label">{internal ? 'Internal note' : 'Reply'}</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} />
                </label>
                {staff ? (
                  <label className="check">
                    <input type="checkbox" checked={internal} onChange={(event) => setInternal(event.target.checked)} />
                    Keep this note internal. Employees cannot read internal notes.
                  </label>
                ) : null}
                <button className="button button-primary" type="submit" disabled={busy}>Post</button>
              </form>
            )}
          </section>
          <section className="stack">
            <h2>History</h2>
            <p className="muted">Only changes made after the history table is in place are listed. Older tickets are not given invented timestamps.</p>
            {activityError ? <div className="banner banner-error">{activityError}</div> : null}
            {activity.length === 0 && !activityError ? <p className="muted">No status or assignment changes are recorded yet.</p> : null}
            <ul className="plain-list">
              {activity.map((event) => {
                const who = firstRelation(event.actor)?.full_name;
                const kind = event.event_type === 'assigned' ? 'Assignment' : 'Status';
                return (
                  <li key={event.id}>
                    <span>{who ? `${who} · ` : ''}{kind} · {event.from_value || 'None'} to {event.to_value || 'Unassigned'}</span>
                    <time>{formatDateTime(event.created_at)}</time>
                  </li>
                );
              })}
            </ul>
          </section>
          <section className="stack">
            <h2>Attachments</h2>
            {attachmentError ? <div className="banner banner-error">{attachmentError}</div> : null}
            {attachments.length === 0 && !attachmentError ? <p className="muted">No files attached.</p> : null}
            <ul className="plain-list">
              {attachments.map((file) => (
                <li key={file.id}>
                  <button className="button button-secondary button-small" type="button" onClick={async () => {
                    const opened = await openAttachment(file.storage_path);
                    if (opened.error) setAttachmentError(opened.error);
                    else window.open(opened.url, '_blank', 'noopener');
                  }}
                  >{file.file_name}</button>
                  <small>{Math.ceil(file.size_bytes / 1024)} KB</small>
                </li>
              ))}
            </ul>
            <form className="stack" onSubmit={submitAttachment}>
              <label className="field">
                <span className="field-label">Screenshot or document, 5 MB maximum</span>
                <input name="attachment" type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,.doc,.docx" />
              </label>
              <button className="button button-secondary" type="submit" disabled={busy}>Upload</button>
            </form>
          </section>
          {(ticket.status === 'Resolved' || ticket.status === 'Closed') && isOwner ? (
            <section className="stack">
              <h2>Feedback</h2>
              <p className="muted">One rating is stored for this ticket. You can update it.</p>
              {feedbackError ? <div className="banner banner-error">{feedbackError}</div> : null}
              <form className="stack" onSubmit={submitFeedback}>
                <label className="field">
                  <span className="field-label">Rating</span>
                  <select value={rating} onChange={(event) => setRating(event.target.value)}>
                    {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">Comment</span>
                  <textarea value={feedbackComment} onChange={(event) => setFeedbackComment(event.target.value)} maxLength={1000} />
                </label>
                <button className="button button-primary" type="submit">{feedback ? 'Update feedback' : 'Submit feedback'}</button>
              </form>
            </section>
          ) : null}
        </div>
        <aside className="detail-side card">
          <h2>Assignment and status</h2>
          {mayAssign ? (
            <AssignSelect
              ticket={ticket}
              agents={agents}
              disabled={busy}
              onAssign={(agentId) => run(() => assignTicket(ticket.id, agentId), 'Ticket assigned to the agent.')}
            />
          ) : null}
          {role === 'agent' && isAssignee ? (
            <p className="muted">This ticket is assigned to you. Change the status, or choose Closed to resolve it.</p>
          ) : null}
          {role === 'agent' && !isAssignee ? (
            <p className="muted">An admin must assign this ticket to you before you can change its status or resolve it.</p>
          ) : null}
          {(role === 'admin' || isAssignee) && progressTargets.length > 0 ? (
            <StatusSelect
              ticket={ticket}
              disabled={busy}
              onChangeStatus={(next) => run(() => updateTicketProgress(ticket.id, next), 'Status updated.')}
              onResolve={(noteText) => run(() => resolveTicket(ticket.id, noteText), 'Ticket resolved and closed.')}
            />
          ) : null}
          {mayReopen ? (
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => run(() => reopenTicket(ticket.id), 'Ticket reopened.')}>
              Reopen ticket
            </button>
          ) : null}
          {!staff && isOwner && ticket.status === 'Resolved' ? (
            <button className="button button-secondary" type="button" disabled={busy} onClick={() => run(() => reopenTicket(ticket.id), 'Ticket reopened.')}>
              Reopen ticket
            </button>
          ) : null}
          <h2>AI review</h2>
          <p className="muted">Suggestions are not confirmed findings. The model cannot run commands, change roles, or close this ticket.</p>
          {ticket.ai ? (
            <div className="stack">
              <p><strong>Suggested category:</strong> {ticket.ai.category}</p>
              <p><strong>Suggested priority:</strong> {ticket.ai.suggested_priority}</p>
              <p><strong>Sentiment:</strong> {ticket.ai.sentiment}</p>
              <p><strong>Suggested team:</strong> {ticket.ai.suggested_team}</p>
              <p><strong>Summary:</strong> {ticket.ai.summary}</p>
              <p><strong>Probable cause:</strong> {ticket.ai.probable_cause}</p>
              <p><strong>Confidence:</strong> {Math.round(Number(ticket.ai.confidence) * 100)}%</p>
              {ticket.ai.escalation_recommended ? <div className="banner">The model recommends escalation. A person still decides.</div> : null}
              <div>
                <strong>Troubleshooting ideas</strong>
                <ol>
                  {ticket.ai.troubleshooting_steps.map((step) => <li key={step}>{step}</li>)}
                </ol>
              </div>
            </div>
          ) : <p className="muted">No validated AI analysis is stored for this ticket.</p>}
          <button
            className="button button-secondary"
            type="button"
            disabled={busy || analyzing}
            onClick={runAnalysis}
          >
            {analyzing ? 'Analyzing…' : ticket.ai ? 'Run analysis again' : 'Run AI analysis'}
          </button>
          <div>
            <h2>Knowledge base</h2>
            {articleNote ? <p className="field-error">{articleNote}</p> : null}
            {articles.length === 0 && !articleNote ? <p className="muted">No published article matches this category.</p> : null}
            <ul className="plain-list">
              {articles.map((article) => (
                <li key={article.id}><Link to={`/knowledge?article=${article.id}`}>{article.title}</Link></li>
              ))}
            </ul>
          </div>
          {staff && (role === 'admin' || isAssignee) ? (
            <div className="stack">
              <label className="field">
                <span className="field-label">Priority</span>
                <select value={ticket.priority} disabled={busy} onChange={(event) => run(() => updateTicketPriority(ticket.id, event.target.value), 'Priority updated.')}>
                  {PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <select value={ticket.category} disabled={busy} onChange={(event) => run(() => updateTicketCategory(ticket.id, event.target.value), 'Category updated.')}>
                  {(categories.includes(ticket.category) ? categories : [ticket.category, ...categories]).map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
