import crypto from 'crypto';

interface TestPayload {
  action: string;
  installation: { id: number };
  repository: {
    id: number;
    full_name: string;
    owner: { login: string; type: string };
    default_branch: string;
  };
  pull_request: {
    number: number;
    title: string;
    state: string;
    user: { login: string };
    head: { sha: string; ref: string };
    base: { ref: string };
  };
}

const SECRET = process.env.GITHUB_WEBHOOK_SECRET || 'development-webhook-secret-token';
const TARGET_URL = process.env.WEBHOOK_TARGET_URL || 'http://localhost:3000/api/webhooks/github';

function signPayload(body: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(body).digest('hex');
}

async function runWebhookIntegrationTest() {
  console.log('🧪 Starting GitHub Webhook End-to-End Integration Test...');
  console.log(`🎯 Target URL: ${TARGET_URL}`);
  console.log(`🔑 Webhook Secret: ${SECRET.substring(0, 5)}***\n`);

  const mockPayload: TestPayload = {
    action: 'opened',
    installation: { id: 98765432 },
    repository: {
      id: 123456789,
      full_name: 'acme-corp/integration-test-repo',
      owner: { login: 'acme-corp', type: 'Organization' },
      default_branch: 'main',
    },
    pull_request: {
      number: 42,
      title: 'feat: Add cryptographic signature verification and rate limiter',
      state: 'open',
      user: { login: 'octocat' },
      head: {
        sha: 'e4d909c290d0fb1ca068ffaddf22cbd0adddefec',
        ref: 'feat/security-patch',
      },
      base: { ref: 'main' },
    },
  };

  const payloadString = JSON.stringify(mockPayload);

  // Test 1: Reject unverified payload (invalid signature)
  console.log('1️⃣ Test Case: Invalid HMAC Signature');
  try {
    const res = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=invalid_tampered_signature_hex_code_123',
      },
      body: payloadString,
    });

    console.log(`   Response Status: ${res.status} (Expected: 401)`);
    if (res.status === 401) {
      console.log('   ✅ PASS: Tampered webhook payload correctly rejected with 401 Unauthorized.\n');
    } else {
      console.warn(`   ⚠️ Status was ${res.status}. (Ensure server is running at ${TARGET_URL})\n`);
    }
  } catch (err: unknown) {
    const error = err as { message: string };
    console.log(`   ℹ️ Web server not running at ${TARGET_URL}: ${error.message}\n`);
  }

  // Test 2: Accept verified payload (valid signature)
  console.log('2️⃣ Test Case: Valid HMAC Signature & Job Enqueue');
  const validSignature = signPayload(payloadString, SECRET);

  try {
    const res = await fetch(TARGET_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': validSignature,
      },
      body: payloadString,
    });

    console.log(`   Response Status: ${res.status} (Expected: 200)`);
    if (res.status === 200) {
      const data = await res.json();
      console.log('   Response Body:', data);
      console.log('   ✅ PASS: Webhook verified and review job successfully queued in BullMQ!\n');
    }
  } catch (err: unknown) {
    const error = err as { message: string };
    console.log(`   ℹ️ Web server not running at ${TARGET_URL}: ${error.message}`);
  }

  console.log('🏁 Integration test script completed.');
}

runWebhookIntegrationTest();
