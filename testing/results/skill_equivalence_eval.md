# Skill equivalence: what each method says on 30 human-labelled pairs

Pairs: 10 similar, 10 related, 10 different. A method "says equivalent" when it would give full or near-full credit.

| Method | Similar found (of 10) | Related wrongly equivalent (of 10) | Different wrongly equivalent (of 10) |
|---|---|---|---|
| Exact keyword (same words) | 0 | 0 | 0 |
| Raw bge-m3 cosine >= 0.6 | 9 | 7 | 5 |
| Raw bge-m3 cosine >= 0.7 | 7 | 1 | 0 |
| Raw bge-m3 cosine >= 0.75 | 5 | 0 | 0 |
| Raw bge-m3 cosine >= 0.8 | 2 | 0 | 0 |

## bge-m3 cosine by human label

- similar: min 0.57, mean 0.72, max 0.89
- related: min 0.56, mean 0.64, max 0.72
- different: min 0.50, mean 0.59, max 0.69

## On the real catalogue (38 skills)

Team-reviewed similar pairs: 18 pairs, min 0.46, mean 0.58, max 0.72. All other pairs: 1388 pairs, min 0.30, mean 0.50, max 0.73. At cosine >= 0.70, 3 of 18 reviewed pairs pass and 5 unreviewed pairs also pass.

## Reading

- On these 30 pairs a cutoff near 0.70 looks usable (it finds most similar pairs with no unrelated pair passing), but a low cutoff (0.60) lets word-trap pairs through, and the scores of the three labels overlap.
- On the real catalogue the overlap is worse: skill pairs the team reviewed as similar and pairs nobody linked have cosines in the same range, so a cosine cannot say which is which.
- Exact keyword matching has no false positives here but finds none of the reworded same-skill pairs.
- So the Skill Match gives credit only for identical catalogue skills (1.0) and team-reviewed similar skills (0.5). The cosine is shown for explanation only, and can be promoted to credit later only after a larger blind review.
- Limits: 30 pairs written by the team (not blind), free-text names for the pair set, one model. This supports "do not use raw cosine as credit yet"; it does not prove the reviewed list is complete.

## Pairs where the cosine and the human label disagree most

- different but high (0.69): "operating a factory plant" vs "cultivating plants"
- different but high (0.68): "dressing a wound" vs "dressing a shop mannequin"
- different but high (0.67): "accounting" vs "key account management"
- different but high (0.65): "marketing" vs "market gardening"
- similar but low (0.57): "Excel" vs "spreadsheet software"
- similar but low (0.62): "social media marketing" vs "managing Facebook and Instagram pages"
- similar but low (0.62): "bookkeeping" vs "recording financial transactions"
- similar but low (0.71): "crop pest control" vs "managing insects that damage plants"
