// Data-access layer for the preprocessed occupation-skill dataset (data/skills/, JSON files; there is no database).
//   role_evidence.json  small file for the 20 scored roles, sent with /api/data (what the role cards show)
//   app_skill_map.json  how the 38 app skills link to the canonical catalogue
//   catalogue / occupations / skill_index  the full dataset, loaded only when a route needs it (about 17 MB)
// Every file carries the fingerprint of the run that made it. If the evidence files are older than the dataset they are
// refused (null), so the app never shows evidence from a different build.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { loadSkillDataset } from './skillDataset.js'

const readOptional = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

export function createSkillEvidence(directory) {
  let evidence
  let full

  // { meta, roles, appMap } or null when the files are missing or from another build of the dataset.
  async function roleEvidence() {
    if (evidence !== undefined) return evidence
    evidence = null
    const [roles, appMap, catalogueHead] = await Promise.all([
      readOptional(path.join(directory, 'role_evidence.json')),
      readOptional(path.join(directory, 'app_skill_map.json')),
      readOptional(path.join(directory, 'catalogue.json')).then((file) => file?.meta ?? null),
    ])
    if (!roles || !appMap || !catalogueHead) return evidence
    const same = roles.meta?.datasetFingerprint === catalogueHead.fingerprint && appMap.meta?.datasetFingerprint === catalogueHead.fingerprint
    if (!same) {
      console.error('[skills] role_evidence.json or app_skill_map.json is older than the dataset; run python pipeline/map_app_skills.py')
      return evidence
    }
    evidence = { meta: { ...roles.meta, synonymTableStatus: roles.meta.synonymTableStatus }, roles: roles.roles, coverage: appMap.coverage, appMap: appMap.skills }
    return evidence
  }

  async function dataset() {
    if (!full) full = loadSkillDataset(directory).catch((error) => {
      full = undefined
      throw error
    })
    return full
  }

  return { roleEvidence, dataset }
}
