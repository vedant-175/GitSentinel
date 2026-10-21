import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as chatHandler } from './route';

describe('Chat API & Markdown Response Formatting Test Suite', () => {
  it('rejects empty or whitespace-only messages with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: '   ' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await chatHandler(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error?.includes('empty'));
  });

  it('rejects invalid JSON payloads with 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: 'invalid-json{{{',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await chatHandler(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error?.includes('JSON'));
  });

  it('returns formatted Markdown table and bold tags when asked why merge is blocked', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        prId: '3',
        message: 'Why is merge blocked for this PR?',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await chatHandler(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.response, 'Response should not be empty');
    // Verify markdown bold formatting
    assert.ok(data.response.includes('**'), 'Response should contain markdown bold formatting');
    // Verify markdown table formatting
    assert.ok(
      data.response.includes('|') && data.response.includes('---'),
      'Response should contain a formatted Markdown table'
    );
  });

  it('returns formatted Markdown patch and table when asked for vulnerability fix', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        prId: '3',
        message: 'Show me the exact fix and code patch for this vulnerability',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await chatHandler(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.response, 'Response should not be empty');
    assert.ok(data.response.includes('```'), 'Response should contain fenced code blocks');
    assert.ok(data.response.includes('**'), 'Response should contain bold headings');
  });

  it('returns formatted Markdown summary when asked for PR summary', async () => {
    const req = new NextRequest('http://localhost:3000/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        prId: '3',
        message: 'Summarize all the findings in this PR',
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await chatHandler(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.response, 'Response should not be empty');
    // Verify response contains markdown formatting (tables, bold, or lists)
    assert.ok(
      data.response.includes('**') || data.response.includes('|') || data.response.includes('#'),
      'Response should contain Markdown formatting'
    );
  });
});
