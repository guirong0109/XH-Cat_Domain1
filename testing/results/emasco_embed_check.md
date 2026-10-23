# eMASCO embeddings: sanity check

Built 2026-10-23T02:04:45.763Z. Model Xenova/bge-m3, dimension 1024.
Rows: 18161 skills, 1812 roles (ids match the rows).

## Role self-check
For every 60th role with skills (30 roles), the mean of the role's own skill vectors was compared with all 1812 role vectors.
The role itself ranked in the top 5 for 24 of 30 roles.
Not in the top 5:
- 1615-02 Chancellor: rank 7
- 2173-11 Pilot/Pilot Examiner Grade AT12: rank 73
- 3131-09 Biofuel Plant Operation Supervisor: rank 60
- 3257-07 Assistant Food Technology Officer Grade C5: rank 17
- 3634-19 Producer Grade B7 (Stage Play Director): rank 40
- 4411-02 Librarian Assistant Grade S1: rank 163

## Malay
"perakaunan" vs "accounting": 0.758. Median of 200 random skill pairs: 0.598. The Malay pair scores above the median.

These checks show the vectors work. They do not measure how accurate CV matching is.
Check took 5 s.
