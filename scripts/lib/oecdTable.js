// Parse OECD Table 6.3 (AI Capability Gap by SOC major group) from the paper's page text.
export const DOMAINS = [
  'Language', 'Social interaction', 'Problem solving', 'Creativity', 'Metacognition',
  'Knowledge, learning and memory', 'Vision', 'Manipulation', 'Robotic intelligence',
];
// US SOC major group names, as printed in Table 6.3.
export const GROUP_NAMES = {
  11: 'Management', 13: 'Business and Financial Operations', 15: 'Computer and Mathematical',
  17: 'Architecture and Engineering', 19: 'Life, Physical, and Social Science',
  21: 'Community and Social Service', 23: 'Legal', 25: 'Educational Instruction and Library',
  27: 'Arts, Design, Entertainment, Sports, and Media', 29: 'Healthcare Practitioners and Technical',
  31: 'Healthcare Support', 33: 'Protective Service', 35: 'Food Preparation and Serving Related',
  37: 'Building and Grounds Cleaning and Maintenance', 39: 'Personal Care and Service',
  41: 'Sales and Related', 43: 'Office and Administrative Support', 45: 'Farming, Fishing, and Forestry',
  47: 'Construction and Extraction', 49: 'Installation, Maintenance, and Repair',
  51: 'Production', 53: 'Transportation and Material Moving',
};
const NUMBER = /\d+\.\d/g;

export function parseTable63(text) {
  const start = text.indexOf('Major Group Code');
  if (start < 0) throw new Error('No "Major Group Code" row');
  const rest = text.slice(start + 'Major Group Code'.length);
  const codeEnd = rest.indexOf('Language');
  const codes = rest.slice(0, codeEnd).match(/\d+/g) || [];
  const rowStarts = [...DOMAINS, 'Overall AI Capability Gap Index'];
  const rows = {};
  let remaining = rest.slice(codeEnd);
  const positions = rowStarts.map((label) => ({ label, at: remaining.indexOf(label) }));
  positions.forEach((p, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].at : remaining.length;
    rows[p.label] = (remaining.slice(p.at + p.label.length, end).match(NUMBER) || []).map(Number);
  });
  const nGroups = codes.length;
  if (nGroups !== 22) throw new Error(`Expected 22 group codes, found ${nGroups}`);
  const groups = {};
  for (const code of codes) {
    if (!GROUP_NAMES[code]) throw new Error(`Unknown major group code ${code}`);
  }
  const average = {};
  for (const label of Object.keys(rows)) {
    const key = label === 'Overall AI Capability Gap Index' ? 'overall' : label;
    const values = rows[label];
    if (values.length !== nGroups && values.length !== nGroups + 1) {
      throw new Error(`Row ${label}: ${values.length} values, expected ${nGroups} (+ average)`);
    }
    values.slice(0, nGroups).forEach((value, i) => {
      groups[codes[i]] ??= { code: codes[i], name: GROUP_NAMES[codes[i]], gaps: {} };
      if (key === 'overall') groups[codes[i]].overall = value;
      else groups[codes[i]].gaps[key] = value;
    });
    if (values.length === nGroups + 1) average[key] = values[nGroups];
  }
  return { domains: DOMAINS, groups, average };
}
