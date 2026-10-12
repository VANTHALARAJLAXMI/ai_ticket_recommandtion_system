import { useEffect, useState } from 'react';
import { IMPACTS, URGENCIES } from '../lib/constants.js';
import { validateTicketInput } from '../lib/validators.js';

const EMPTY = {
  title: '',
  description: '',
  category: '',
  business_impact: 'Medium',
  urgency: 'Medium',
  affected_system: '',
};

export default function TicketForm({ categories, onSubmit, submitting }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!values.category && categories.length) {
      setValues((current) => ({ ...current, category: categories[0] }));
    }
  }, [categories, values.category]);

  function setField(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    const result = validateTicketInput(values, categories);
    setErrors(result.errors);
    if (result.ok) onSubmit(result.value);
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span className="field-label">Title</span>
        <input value={values.title} onChange={(event) => setField('title', event.target.value)} maxLength={160} required />
        {errors.title ? <span className="field-error">{errors.title}</span> : null}
      </label>
      <label className="field">
        <span className="field-label">What happened?</span>
        <textarea value={values.description} onChange={(event) => setField('description', event.target.value)} maxLength={5000} required />
        {errors.description ? <span className="field-error">{errors.description}</span> : null}
      </label>
      <div className="filters">
        <label className="field">
          <span className="field-label">Category</span>
          <select value={values.category} onChange={(event) => setField('category', event.target.value)}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {errors.category ? <span className="field-error">{errors.category}</span> : null}
        </label>
        <label className="field">
          <span className="field-label">Business impact</span>
          <select value={values.business_impact} onChange={(event) => setField('business_impact', event.target.value)}>
            {IMPACTS.map((impact) => <option key={impact}>{impact}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Urgency</span>
          <select value={values.urgency} onChange={(event) => setField('urgency', event.target.value)}>
            {URGENCIES.map((urgency) => <option key={urgency}>{urgency}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field-label">Affected device or application (optional)</span>
        <input value={values.affected_system} onChange={(event) => setField('affected_system', event.target.value)} maxLength={200} />
        {errors.affected_system ? <span className="field-error">{errors.affected_system}</span> : null}
      </label>
      <button className="button button-primary" type="submit" disabled={submitting || categories.length === 0}>
        {submitting ? 'Submitting…' : 'Submit ticket'}
      </button>
    </form>
  );
}
