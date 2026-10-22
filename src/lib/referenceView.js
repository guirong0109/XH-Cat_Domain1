// Text for the "checked on" labels next to reference links. Pure; the data comes from data/references.json.
import { formatDate } from './roleView.js';

const FIELD_WORDS = { tasks: 'tasks', basic_skills: 'skills', specific_skills: 'skills', description: 'description' };

function checkedText(entry) {
  if (entry.ok) return { ok: true, text: `Checked ${formatDate(entry.checkedAt)}, link works` };
  const when = formatDate(entry.failedAt ?? entry.checkedAt);
  return { ok: false, text: `Could not be checked on ${when}. The link is kept, please try it.` };
}

export function linkStatus(references, url) {
  const entry = references?.links?.[url];
  if (!entry) return { ok: null, text: 'Not checked yet' };
  return checkedText(entry);
}

export function roleReference(references, role) {
  const entry = references?.roles?.[role.code];
  if (!entry) return { ok: null, text: 'Not checked yet', note: null };
  const status = checkedText(entry);
  const fields = [...new Set((entry.changed ?? []).map((field) => FIELD_WORDS[field] ?? field))];
  const saved = role.source?.fetchedAt ? ` from ${formatDate(role.source.fetchedAt)}` : '';
  const note =
    fields.length > 0
      ? `eMASCO changed the ${fields.join(' and ')} for this role on the last check. We still show the saved version${saved}. Our team needs to review the change.`
      : null;
  return { ...status, note };
}

export function referencesLine(references) {
  if (!references?.checkedAt) return 'Not refreshed yet.';
  const roles = Object.values(references.roles ?? {}).filter((entry) => entry.ok);
  const changed = roles.filter((entry) => (entry.changed ?? []).length > 0).length;
  const links = Object.values(references.links ?? {});
  const bad = links.filter((entry) => !entry.ok).length;
  return `Last refresh: ${formatDate(references.checkedAt)} · ${roles.length} roles read, ${changed} changed, ${bad} ${bad === 1 ? 'link' : 'links'} not checked`;
}
