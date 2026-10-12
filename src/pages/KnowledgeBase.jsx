import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EmptyState from '../components/EmptyState.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';
import SearchBar from '../components/SearchBar.jsx';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { validateArticle } from '../lib/validators.js';
import { deleteArticle, listArticles, saveArticle } from '../services/knowledgeService.js';
import { listCategories } from '../services/ticketService.js';

const EMPTY = { title: '', category: '', summary: '', content: '', troubleshooting_steps: '', is_published: false };

export default function KnowledgeBase() {
  const { role } = useAuth();
  const pushToast = useToast();
  const [params, setParams] = useSearchParams();
  const [articles, setArticles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(false);
  const admin = role === 'admin';

  async function load(nextSearch = search, nextCategory = category) {
    const [articleResult, categoryResult] = await Promise.all([
      listArticles({ search: nextSearch, category: nextCategory, includeUnpublished: admin }),
      listCategories({ includeInactive: admin }),
    ]);
    setArticles(articleResult.articles);
    setCategories(categoryResult.categories.map((item) => item.name));
    setError(articleResult.error || categoryResult.error || '');
    const requested = params.get('article');
    const match = articleResult.articles.find((article) => article.id === requested) || articleResult.articles[0] || null;
    setSelected(match);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [admin]);

  function choose(article) {
    setSelected(article);
    setEditingId(article?.id ?? null);
    setParams(article ? { article: article.id } : {});
    if (admin && article) {
      setForm({
        title: article.title,
        category: article.category,
        summary: article.summary,
        content: article.content,
        troubleshooting_steps: article.troubleshooting_steps || '',
        is_published: Boolean(article.is_published),
      });
    }
  }

  async function submit(event) {
    event.preventDefault();
    const names = categories.length ? categories : [];
    const result = validateArticle(form, names);
    setErrors(result.errors);
    if (!result.ok) return;
    const saved = await saveArticle(form, names, editingId);
    if (saved.error) {
      pushToast(saved.error, 'error');
      return;
    }
    pushToast('Article saved.', 'success');
    setForm(EMPTY);
    load();
  }

  if (loading) return <LoadingSpinner label="Loading articles" />;

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Knowledge base</h1>
          <p>Articles stored in Supabase. Recommendations on tickets only link to these records.</p>
        </div>
      </header>
      {error ? <div className="banner banner-error">{error}</div> : null}
      <form className="filters" onSubmit={(event) => { event.preventDefault(); load(search, category); }}>
        <SearchBar id="kb-search" value={search} onChange={setSearch} placeholder="Search articles" />
        <label className="field">
          <span className="field-label">Category</span>
          <select value={category} onChange={(event) => { setCategory(event.target.value); load(search, event.target.value); }}>
            <option value="">All</option>
            {categories.map((name) => <option key={name}>{name}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="submit">Search</button>
      </form>
      <div className="split">
        <div className="stack">
          {articles.length === 0 ? <EmptyState title="No articles" message="Nothing matches that search." /> : articles.map((article) => (
            <button key={article.id} className="card ticket-card" type="button" onClick={() => choose(article)}>
              <span className="badge badge-medium">{article.category}</span>
              <h3>{article.title}</h3>
              <p className="muted">{article.summary}</p>
            </button>
          ))}
        </div>
        <article className="panel card">
          {selected ? (
            <>
              <h2>{selected.title}</h2>
              <p>{selected.summary}</p>
              <p className="description">{selected.content}</p>
              {selected.troubleshooting_steps ? <p className="description">{selected.troubleshooting_steps}</p> : null}
              {admin ? <p className="muted">{selected.is_published ? 'Published' : 'Draft'}</p> : null}
            </>
          ) : <p className="muted">Select an article.</p>}
          {admin ? (
            <form className="stack" onSubmit={submit}>
              <h2>{selected ? 'Edit article' : 'New article'}</h2>
              <label className="field">
                <span className="field-label">Title</span>
                <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
                {errors.title ? <span className="field-error">{errors.title}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Category</span>
                <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
                  <option value="">Choose</option>
                  {categories.map((name) => <option key={name}>{name}</option>)}
                </select>
                {errors.category ? <span className="field-error">{errors.category}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} />
                {errors.summary ? <span className="field-error">{errors.summary}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Content</span>
                <textarea value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} />
                {errors.content ? <span className="field-error">{errors.content}</span> : null}
              </label>
              <label className="field">
                <span className="field-label">Troubleshooting steps</span>
                <textarea value={form.troubleshooting_steps} onChange={(event) => setForm({ ...form, troubleshooting_steps: event.target.value })} />
                {errors.troubleshooting_steps ? <span className="field-error">{errors.troubleshooting_steps}</span> : null}
              </label>
              <label className="check">
                <input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} />
                Published
              </label>
              <div className="row">
                <button className="button button-primary" type="submit">{selected ? 'Save changes' : 'Publish article'}</button>
                <button className="button button-secondary" type="button" onClick={() => { setSelected(null); setEditingId(null); setForm(EMPTY); setParams({}); }}>New article</button>
                {selected ? <button className="button button-danger" type="button" onClick={() => setPendingDelete(true)}>Delete</button> : null}
              </div>
            </form>
          ) : null}
        </article>
      </div>
      <ConfirmDialog
        open={pendingDelete}
        title="Delete this article?"
        message="The article will disappear from search and from ticket recommendations."
        confirmLabel="Delete"
        danger
        onCancel={() => setPendingDelete(false)}
        onConfirm={async () => {
          const result = await deleteArticle(selected.id);
          setPendingDelete(false);
          if (result.error) pushToast(result.error, 'error');
          else {
            pushToast('Article deleted.', 'success');
            setForm(EMPTY);
            load();
          }
        }}
      />
    </section>
  );
}
