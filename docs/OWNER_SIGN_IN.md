# Owner sign-in: a key for your machine, Google for the website

Who owns a company decides who can start its rooms, spend on it, read what its people wrote, and approve what leaves. Out of the box the owner is whoever holds a **visitor cookie**: an unguessable id, but only a browser's memory of one. Lose the cookie and the companies are on disk with nobody who can open them; leave the server where another person can reach it and whoever gets the cookie owns everything.

`COMPANY_OWNER_AUTH` chooses how the owner is known. The chat room's own rooms are unaffected: they stay the visitor's, and signing in is only about companies.

| `COMPANY_OWNER_AUTH` | For | The owner is |
|---|---|---|
| `off` (default) | one person, one browser, nothing exposed | the visitor cookie, as before |
| `key` | a machine you work on | whoever has the **owner key**: one line in `<data>/owner/owner.key`, made at the first start |
| `google` | the website | a **Google account** from your list (`COMPANY_OWNER_EMAILS`); the owner id is a hash of the account's stable id |

Everything else works the same in both: a session is a random 256-bit token in an HttpOnly, SameSite=Strict cookie (`cr_owner`), kept only as a hash, lasting `COMPANY_OWNER_SESSION_DAYS` (30), ended by signing out. Every company, flow, roster and Hall route acts for the session's owner id (so a second browser that signs in sees the same companies) and answers `401 sign_in_required` without one. The schema, the operator's settings and the defaults stay readable.

## A key, for local testing

```
COMPANY_OWNER_AUTH=key npm run server
```

The first start makes the key and logs where it is (never the key itself): `<data>/owner/owner.key`. Open the console (`/company`), paste the key, and you are in; any other browser can do the same. The data folder holds only the key's SHA-256 (`owner.json`) and the sessions (as hashes).

- `npm run owner -- rotate` makes a new key and ends every session (a running server notices at once).
- A wrong key is counted: five in fifteen minutes from one address, or twenty-five in an hour from all, then `429`.
- Anyone who can read the data folder can read the key. That is you; it is the same trust as the files.

## Bringing companies that already exist under the owner

Companies made before sign-in belong to the cookie id that made them. Two ways to attach them (stop the server first; a dry run is the default and a backup is taken before `--apply`):

```
npm run owner -- status                                   # who owns what, and which Google accounts have signed in
npm run owner -- init --owner-id <the id that owns them>  # key mode: make the key owner under that id; nothing moves
npm run owner -- adopt --from <old id> --apply            # key mode: move another id's companies, flows and roster to the key owner
npm run owner -- adopt --from <old id> --to-email me@example.com --apply   # Google: move them to an account that has signed in once
```

## Google, for the website

The server does the whole OAuth 2.0 authorization-code flow itself (state, nonce and PKCE; the ID token's signature is checked against Google's published keys; issuer, audience, expiry, nonce and a verified email are checked). The console loads **nothing from Google**, so its policy (`script-src 'self'`) is as strict as it was: "Sign in with Google" is a link to the server's own `/api/company/owner/google/start`.

**Register the client once** (Google Cloud console, the project the website already uses, *APIs and services → Credentials*): an **OAuth client ID** of type **Web application**. Add the authorized redirect URI `https://<where the browser reaches the chat server>/api/company/owner/google/callback` (for a server behind a path such as `/chatroom`, include it: `https://site.example/chatroom/api/company/owner/google/callback`). For trying it on your own machine, `http://localhost:3012/api/company/owner/google/callback` is allowed. Google shows the client ID and a client secret; the secret goes only in the server's environment.

```
COMPANY_OWNER_AUTH=google
COMPANY_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
COMPANY_GOOGLE_CLIENT_SECRET=...            # a secret: environment only, never a file in the repo
COMPANY_PUBLIC_URL=https://site.example/chatroom   # where the BROWSER reaches this server; https, except for localhost
COMPANY_OWNER_EMAILS=you@gmail.com, partner@example.org   # the only accounts that may own companies
```

- **It lets nobody in until all four are set** (and says which are missing at `/api/company/owner` and in the log); it never falls back to the cookie. `COMPANY_PUBLIC_URL` is never taken from a request.
- **Only the listed accounts.** A company spends the operator's model key, and nothing here meters it per user; the service plan (`HANDOFF_SERVICE_LAUNCH.md`) says the chat room needs credit metering before it is open to anyone, or it is an uncapped bill. So this is *you and the people you name*, not sign-up. Open sign-up needs per-user spend limits first.
- **An email is bound to the Google account that first signed in under it** (`<data>/owner/accounts.json`, also where the operator reads each account's owner id). The same address arriving from a different account (an address that changed hands) is refused until the operator removes the old entry.
- **The owner id** is a hash of Google's `sub`, never of the email, so the same account is the same owner from every browser, and changing an email does not change who owns what.
- Wrong or forged sign-ins are counted per address (five in fifteen minutes, then `429`); there is no limit across addresses, since there is nothing to guess and one would let a stranger lock the owner out.
- Cookies are `Secure` whenever the public address is https. A session of an account that leaves the list is dropped at the next start.

## What this does not do

- It is **not user accounts**: one key owner, or the accounts on your list. There is no sign-up, no credits and no per-user limits.
- It does not host the chat room on the website. The hosted service does not include it today (the website answers `chatroom_unavailable`), and running it there also means running its single process (rooms live in memory; sessions are files on that instance) with a shared data folder.
- Behind a proxy that does not pass the client's address, the per-address limit is one limit for everyone.
- The key and the sessions file are readable by anyone who can read the data folder.

Code: `chatroom/server/company/ownerAuth.js`, `googleAuth.js`, `ownerAdopt.js`, `routes/owner.js`, `scripts/owner.mjs`. Tests: `ownerAuth.test.js`, `googleAuth.test.js` (a stand-in Google that signs real tokens), `ownerGoogle.test.js`, `ownerAdopt.test.js`, `ownerCli.test.js`.
