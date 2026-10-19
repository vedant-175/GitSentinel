import { prisma } from '@ai-reviewer/db';

async function main() {
  console.log('====================================================');
  console.log('🔍 FULL SYSTEM HEALTH & FUNCTIONALITY AUDIT');
  console.log('====================================================\n');

  let allOk = true;

  // 1. Database Check
  console.log('--- 1. Database (PostgreSQL) Status ---');
  try {
    const [instCount, repoCount, prCount, reviewCount, failedCount, issueCount] = await Promise.all([
      prisma.installation.count(),
      prisma.repository.count(),
      prisma.pullRequest.count(),
      prisma.review.count(),
      prisma.failedReview.count(),
      prisma.reviewIssue.count(),
    ]);

    console.log(`✅ PostgreSQL Connected successfully.`);
    console.log(`   - Installations: ${instCount}`);
    console.log(`   - Repositories:   ${repoCount}`);
    console.log(`   - Pull Requests:  ${prCount}`);
    console.log(`   - Reviews:        ${reviewCount}`);
    console.log(`   - Failed Reviews: ${failedCount}`);
    console.log(`   - Review Issues:  ${issueCount}\n`);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    allOk = false;
  }

  // 2. Worker Service Check
  console.log('--- 2. Worker Service (BullMQ / Metrics) ---');
  try {
    const healthRes = await fetch('http://127.0.0.1:3001/health');
    const healthJson = await healthRes.json();
    console.log(`✅ Worker /health status: ${healthRes.status}`, healthJson);

    const metricsRes = await fetch('http://127.0.0.1:3001/metrics');
    const metricsJson = await metricsRes.json();
    console.log(`✅ Worker /metrics status: ${metricsRes.status}`);
    console.log(`   - Active Jobs:  ${metricsJson.queue?.active ?? 0}`);
    console.log(`   - Waiting Jobs: ${metricsJson.queue?.waiting ?? 0}`);
    console.log(`   - Completed:    ${metricsJson.queue?.completed ?? 0}`);
    console.log(`   - Failed:       ${metricsJson.queue?.failed ?? 0}`);
    console.log(`   - Total LLM Tokens: ${metricsJson.tokens?.totalTokens ?? 0}\n`);
  } catch (err) {
    console.error('❌ Worker service check failed:', err);
    allOk = false;
  }

  // 3. Web Service Check
  console.log('--- 3. Web Service (Next.js Dashboard) ---');
  try {
    const webHealthRes = await fetch('http://localhost:3000/api/health');
    const webHealthJson = await webHealthRes.json();
    console.log(`✅ Web /api/health status: ${webHealthRes.status}`, webHealthJson);

    // Check login page
    const loginRes = await fetch('http://localhost:3000/login');
    console.log(`✅ Web /login HTTP status: ${loginRes.status}`);

    // Check stylesheet
    const loginHtml = await loginRes.text();
    const cssMatch = loginHtml.match(/href="([^"]+\.css[^"]*)"/);
    if (cssMatch) {
      const cssRes = await fetch('http://localhost:3000' + cssMatch[1]);
      console.log(`✅ Web CSS bundle status: ${cssRes.status} (${cssRes.headers.get('content-type')})\n`);
    } else {
      console.warn('⚠️ No CSS link matched in login HTML\n');
    }
  } catch (err) {
    console.error('❌ Web service check failed:', err);
    allOk = false;
  }

  // 4. Authentication & Multi-Tenant Session Access
  console.log('--- 4. Authentication & Multi-Tenant Session Access ---');
  try {
    const csrfRes = await fetch('http://localhost:3000/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    const csrfCookies = (csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || ''])
      .map((c) => c.split(';')[0])
      .join('; ');

    // Log in as Alex Developer
    const loginResponse = await fetch('http://localhost:3000/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: csrfCookies,
      },
      body: new URLSearchParams({
        csrfToken,
        username: 'alex-developer',
        json: 'true',
      }),
      redirect: 'manual',
    });

    const sessionCookies = (loginResponse.headers.getSetCookie ? loginResponse.headers.getSetCookie() : [loginResponse.headers.get('set-cookie') || ''])
      .map((c) => c.split(';')[0])
      .join('; ');

    console.log(`✅ Credentials Login (alex-developer): Status ${loginResponse.status}`);

    // Fetch repositories with session cookie
    const repoRes = await fetch('http://localhost:3000/api/repositories', {
      headers: { Cookie: sessionCookies },
    });
    const repoData = await repoRes.json();
    console.log(`✅ /api/repositories (Authenticated): Status ${repoRes.status}`);
    console.log(`   - Found ${Array.isArray(repoData) ? repoData.length : 0} repositories for tenant:`, Array.isArray(repoData) ? repoData.map((r: any) => r.fullName) : []);

    // Fetch pull requests with session cookie
    const prRes = await fetch('http://localhost:3000/api/pull-requests', {
      headers: { Cookie: sessionCookies },
    });
    const prData = await prRes.json();
    console.log(`✅ /api/pull-requests (Authenticated): Status ${prRes.status}`);
    console.log(`   - Found ${Array.isArray(prData) ? prData.length : 0} PRs for tenant:`, Array.isArray(prData) ? prData.map((p: any) => `#${p.githubPrNumber}: ${p.title}`) : [], '\n');
  } catch (err) {
    console.error('❌ Auth / API check failed:', err);
    allOk = false;
  }

  // 5. Multi-Tenant Isolation Check (Acme Corp vs Alex Developer)
  console.log('--- 5. Tenant Isolation Verification ---');
  try {
    const csrfRes = await fetch('http://localhost:3000/api/auth/csrf');
    const { csrfToken } = await csrfRes.json();
    const csrfCookies = (csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie') || ''])
      .map((c) => c.split(';')[0])
      .join('; ');

    const loginResponse = await fetch('http://localhost:3000/api/auth/callback/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: csrfCookies,
      },
      body: new URLSearchParams({
        csrfToken,
        username: 'acme-corp',
        json: 'true',
      }),
      redirect: 'manual',
    });

    const acmeCookies = (loginResponse.headers.getSetCookie ? loginResponse.headers.getSetCookie() : [loginResponse.headers.get('set-cookie') || ''])
      .map((c) => c.split(';')[0])
      .join('; ');

    const acmeRepoRes = await fetch('http://localhost:3000/api/repositories', {
      headers: { Cookie: acmeCookies },
    });
    const acmeRepos = await acmeRepoRes.json();
    console.log(`✅ Credentials Login (acme-corp): Status ${loginResponse.status}`);
    console.log(`   - Acme Corp Repositories:`, Array.isArray(acmeRepos) ? acmeRepos.map((r: any) => r.fullName) : []);

    // Verify Acme cannot see Alex's repos
    const hasAlexRepo = Array.isArray(acmeRepos) && acmeRepos.some((r: any) => r.fullName.includes('alex-developer'));
    if (!hasAlexRepo) {
      console.log('✅ PASS: Multi-tenant isolation verified: Acme Corp cannot view Alex Developer repos!\n');
    } else {
      console.error('❌ FAIL: Cross-tenant leakage detected!\n');
      allOk = false;
    }
  } catch (err) {
    console.error('❌ Tenant isolation check failed:', err);
    allOk = false;
  }

  console.log('====================================================');
  if (allOk) {
    console.log('🎉 AUDIT COMPLETE: ALL SYSTEMS ARE OPERATIONAL & FUNCTIONING PROPERLY!');
  } else {
    console.log('⚠️ AUDIT COMPLETE WITH ISSUES: Check logs above.');
  }
  console.log('====================================================');
}

main().catch(console.error);
