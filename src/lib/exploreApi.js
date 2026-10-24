// Calls to the server for "Explore all roles". The CV text is only sent in the request; nothing is stored.

async function readError(response) {
  if (response.status === 413) return 'too-long';
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : 'failed';
  } catch {
    return 'failed';
  }
}

export async function searchSkills(query, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`/api/emasco/skills?q=${encodeURIComponent(query)}&limit=8`);
    if (response.status !== 200) return { ok: false, error: await readError(response) };
    const body = await response.json();
    return Array.isArray(body?.skills) ? { ok: true, skills: body.skills, methods: Array.isArray(body.methods) ? body.methods : [], meaning: typeof body.status?.meaning === 'string' ? body.status.meaning : 'unknown' } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

// body: { skillIds } or { text }, plus includeHigher.
export async function matchRoles(body, fetchImpl = fetch) {
  try {
    const response = await fetchImpl('/api/emasco/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status !== 200) return { ok: false, error: await readError(response) };
    const result = await response.json();
    return result && Array.isArray(result.roles) ? { ok: true, result } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
