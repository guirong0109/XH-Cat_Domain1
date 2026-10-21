# arXiv API: open problem (for the team to investigate)

Date: 2026-10-21. Status: **not solved**. The user will look into it later.
Context: we want a dated, updatable "AI advancement" signal (item B). OpenAlex works from the user's PC, so B can be built without arXiv. arXiv would be a second source.

## What happened

Tested from the user's Windows PC with Node 24 `fetch` (no proxy, no login, no email sent).

| Query | Result |
|---|---|
| `https://export.arxiv.org/api/query?search_query=all:solar&max_results=1` | **Works.** HTTP 200 in about 0.5 s. `opensearch:totalResults` = 107280. |
| Phrase + date range (below), for 3 topics × 2 years | **Fails.** HTTP 500 every time (6 of 6), about 0.7 s each. The body has no real count (the regex found "1", which is not a real total). |

The failing query, before URL encoding:

```
all:"large language model" AND submittedDate:[202401010000 TO 202412312359]
```

It was sent with `encodeURIComponent`, so spaces became `%20`, quotes `%22`, and brackets `%5B` / `%5D`. Calls were spaced 3.5 s apart, as arXiv asks.

Earlier (first session, cloud server): arXiv also returned errors, but that was from a shared cloud IP and may have been rate limiting. Today's 500s happen from a home connection too, so the query format is the most likely cause.

## Ideas to try (not tested)

1. **Use `+` instead of `%20` for spaces**, as in the arXiv API manual's examples, for example `search_query=all:%22large+language+model%22+AND+submittedDate:[202401010000+TO+202412312359]`.
2. **Do not encode the brackets** `[` `]` and the colon, or encode only the quotes.
3. **Try the parts separately**: the phrase alone (`all:%22large+language+model%22`), then the date range alone, to see which part causes the 500.
4. **Try `ti:` or `abs:` instead of `all:`** for phrase searches.
5. Check whether arXiv expects `submittedDate` with exactly 12 digits (YYYYMMDDHHMM) on both sides (we used that).
6. If 500s continue, check the arXiv API status page and the API user group.

## How to reproduce

Run in a terminal (Node 22 or newer):

```bash
node -e "fetch('https://export.arxiv.org/api/query?search_query=' + encodeURIComponent('all:\"large language model\" AND submittedDate:[202401010000 TO 202412312359]') + '&max_results=0').then(r => { console.log(r.status); return r.text(); }).then(t => console.log(t.slice(0, 400)))"
```

Expected today: `500`. A fix is confirmed when it prints `200` and a real `opensearch:totalResults` number.

## References

- arXiv API user manual: https://info.arxiv.org/help/api/user-manual.html
- arXiv API terms of use: https://info.arxiv.org/help/api/tou.html (attribution required; at most 1 request every 3 seconds)
