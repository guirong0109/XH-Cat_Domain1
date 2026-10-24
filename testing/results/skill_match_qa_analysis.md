# Current Skill Match: QA analysis

## 1. Equal weights vs the 1.0 / 1.5 heuristic

Same students, same roles. "Equal" gives every required skill weight 1.

| Student | Top 3 (1.0/1.5) | Top 3 (equal) | Same top-3 set | Largest rank move over 20 roles | Largest score change |
|---|---|---|---|---|---|
| Aina · Diploma IT | Business Intelligence Analyst 67%; Database Assistant 62%; Data Analyst 55% | Business Intelligence Analyst 68%; Data Analyst 57%; Database Assistant 55% | 3 of 3 | 3 | 7.0 points |
| Ravi · Diploma E&E | Solar Cell Technician 77%; Energy Audit Technician 51%; Computer Network Technician 39% | Solar Cell Technician 78%; Energy Audit Technician 46%; Computer Network Technician 39% | 3 of 3 | 2 | 6.7 points |
| Mei Ling · Diploma Business | Business Intelligence Analyst 57%; Database Assistant 46%; Healthcare Analyst 46% | Business Intelligence Analyst 60%; Digital Content Writer/Creator 50%; Healthcare Analyst 50% | 2 of 3 | 2 | 6.7 points |
| Farah · Diploma in Accounting | Business Intelligence Analyst 46%; Healthcare Analyst 37%; Accounting Technician 34% | Business Intelligence Analyst 48%; Healthcare Analyst 40%; Accounting Technician 32% | 3 of 3 | 3 | 5.3 points |

## 2. Why the accounting sample ranks Business Intelligence Analyst first

### Business Intelligence Analyst: 45.7% (5 required skills, total weight 7)

| Required skill | Class | Weight | Credited through | Coverage |
|---|---|---|---|---|
| SQL and databases | specific | 1.5 | - | 0% |
| Data visualisation | specific | 1.5 | Spreadsheets (Excel) (reviewed similar) | 40% |
| Statistics | specific | 1.5 | Spreadsheets (Excel) (reviewed similar) | 40% |
| Communication | basic | 1 | Communication (same skill) | 80% |
| Spreadsheets (Excel) | specific | 1.5 | Spreadsheets (Excel) (same skill) | 80% |

### Accounting Technician: 34.3% (9 required skills, total weight 11.5)

| Required skill | Class | Weight | Credited through | Coverage |
|---|---|---|---|---|
| Attention to detail | basic | 1 | - | 0% |
| Communication | basic | 1 | Communication (same skill) | 80% |
| Problem solving | basic | 1 | - | 0% |
| Time management | basic | 1 | - | 0% |
| Financial reporting | specific | 1.5 | Financial reporting (same skill) | 80% |
| Bookkeeping and reconciliation | specific | 1.5 | Bookkeeping and reconciliation (same skill) | 80% |
| Accounting and audit standards | specific | 1.5 | - | 0% |
| Auditing and internal control | specific | 1.5 | - | 0% |
| Accounting software (ERP) | specific | 1.5 | Accounting software (ERP) (same skill) | 50% |

## 2b. Ranking with exact skills only (reviewed similar credit switched off)

| Student | Top 3 with similar credit | Top 3 exact skills only |
|---|---|---|
| Aina · Diploma IT | Business Intelligence Analyst 67%; Database Assistant 62%; Data Analyst 55% | Database Assistant 54%; Business Intelligence Analyst 50%; Data Analyst 41% |
| Ravi · Diploma E&E | Solar Cell Technician 77%; Energy Audit Technician 51%; Computer Network Technician 39% | Solar Cell Technician 62%; Energy Audit Technician 38%; Computer Network Technician 31% |
| Mei Ling · Diploma Business | Business Intelligence Analyst 57%; Database Assistant 46%; Healthcare Analyst 46% | Database Assistant 46%; Business Intelligence Analyst 36%; Digital Learning Specialist 35% |
| Farah · Diploma in Accounting | Business Intelligence Analyst 46%; Healthcare Analyst 37%; Accounting Technician 34% | Accounting Technician 34%; Tax Consultant 29%; Business Intelligence Analyst 29% |

## 3. Reviewed similar pairs: how many of the 20 roles each can touch

| Required skill <- student skill | Roles that require the skill | Cosine (display only) |
|---|---|---|
| Business process analysis <- Data visualisation | 1 | 0.56 |
| Content writing <- Communication | 1 | 0.56 |
| Customer service <- Communication | 2 | 0.63 |
| Data visualisation <- Spreadsheets (Excel) | 3 | 0.52 |
| Energy auditing <- Electrical wiring | 1 | 0.58 |
| Healthcare data and records <- SQL and databases | 1 | 0.60 |
| Healthcare data and records <- Statistics | 1 | 0.61 |
| Network security <- Networking basics | 2 | 0.71 |
| Project coordination <- Teamwork | 2 | 0.70 |
| Renewable energy system design <- Solar PV basics | 1 | 0.52 |
| SEO and web analytics <- Data visualisation | 2 | 0.53 |
| SEO and web analytics <- Web development | 2 | 0.60 |
| Solar PV basics <- Electrical wiring | 2 | 0.46 |
| Statistics <- Spreadsheets (Excel) | 3 | 0.46 |
| UX research and prototyping <- Graphic design | 1 | 0.62 |
| Version control (Git) <- Web development | 1 | 0.50 |
| Web development <- Graphic design | 3 | 0.72 |
| Web development <- Python programming | 3 | 0.60 |
