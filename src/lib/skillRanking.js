// Ranks the scored roles by Current Skill Match only (ties by title). Each entry keeps the old score fields
// (outlook, demand, automatable, SDG bonus) so they can be shown beside the match, never mixed into it.
import { scoreRole } from './scoring.js';
import { compareByMatch, skillMatch } from './skillMatch.js';

export function rankBySkillMatch(roles, profile, ctx, scenario) {
  return roles
    .map((role) => {
      const skill = skillMatch(role, profile, ctx);
      const legacy = scoreRole(role, profile, ctx, scenario);
      return {
        role,
        score: { ...legacy, legacyMatch: legacy.match, match: skill.match, matchAvailable: skill.status === 'ok', skill },
      };
    })
    .sort((a, b) => compareByMatch({ match: a.score.match, title: a.role.title }, { match: b.score.match, title: b.role.title }));
}
