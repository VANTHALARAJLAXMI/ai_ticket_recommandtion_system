import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_MANUAL, AI_NOT_CONNECTED, messageFromInvokeError } from './aiInvoke.js';

test('a function HTTP error shows the function message', async () => {
  const error = {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => ({ ok: false, message: 'The Ollama API timed out. The ticket can still be handled manually.' }) },
  };
  const result = await messageFromInvokeError(error);
  assert.equal(result.unavailable, false);
  assert.equal(result.message, 'The Ollama API timed out. The ticket can still be handled manually.');
});

test('a network failure is reported as not connected', async () => {
  const error = { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' };
  const result = await messageFromInvokeError(error);
  assert.equal(result.unavailable, true);
  assert.equal(result.message, AI_NOT_CONNECTED);
});

test('an HTTP error without a safe message stays manual', async () => {
  const error = {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: { json: async () => ({ message: 'service_role key leaked' }) },
  };
  const result = await messageFromInvokeError(error);
  assert.equal(result.message, AI_MANUAL);
});
