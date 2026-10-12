import assert from 'node:assert/strict';
import test from 'node:test';
import { readEmbeddedTicketDetails } from './format.js';

test('ticket details stored in the description are read back', () => {
  const parsed = readEmbeddedTicketDetails(
    'networks issuse and localnetwork issuse\n\nBusiness impact: High\n\nUrgency: Critical\n\nAffected system: hello',
  );
  assert.equal(parsed.description, 'networks issuse and localnetwork issuse');
  assert.equal(parsed.business_impact, 'High');
  assert.equal(parsed.urgency, 'Critical');
  assert.equal(parsed.affected_system, 'hello');
});

test('a description without embedded details stays unchanged', () => {
  const parsed = readEmbeddedTicketDetails('The printer on floor 2 is offline.');
  assert.equal(parsed.description, 'The printer on floor 2 is offline.');
  assert.equal(parsed.business_impact, '');
  assert.equal(parsed.urgency, '');
  assert.equal(parsed.affected_system, '');
});
