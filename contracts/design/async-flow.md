# Cross-contract async flow for zkTGuard v0.2 Phase C

Design notes for the four-message sequence the verifier walks to mint
a soulbound credential. This is the document referenced from
`docs/docs/architecture.md` and from the paper's Implementation
section.

---

## 1. Why async

TON is an actor model. A contract can read its own storage in a single
transaction but cannot synchronously read another contract's. To honour
the v0.1 boundary between the **verifier** (proofs) and the
**registry** (which `(app_id, claim_type)` pairs are accepted), v0.2
breaks the verify path into two transactions joined by a request/reply:

1. **`op::verify_claim` (user → verifier).** The verifier validates
   the proof's point arity, group membership, chain id, expiration,
   and the four-pair Groth16 pairing equation. On success it
   *parks* the proof under a fresh `query_id` and sends
   `op::query_registered` to the configured registry. **No nullifier
   has been recorded yet.**

2. **`op::query_registered` (verifier → registry).** Asks whether
   `(app_id, claim_type)` is registered. Public op — anyone can call.

3. **`op::query_reply` (registry → verifier).** Body carries
   `(query_id, app_id, claim_type, is_registered)`. The verifier
   rejects replies from anyone other than the configured registry
   (exit 430) and replies referring to unknown query ids (exit 431).
   On a positive reply: re-check expiration + nullifier reuse, record
   the nullifier, send `op::mint` to the soulbound collection. On a
   negative reply: drop the parked entry; emit no message back to the
   user.

4. **`op::mint` (verifier → collection).** The collection deploys a
   non-transferable Item via `stateInit`. Item carries `(index,
   collection_addr, owner_addr, content_ref)` with content =
   `(app_id, claim_type, expiration, claim_hash, mint_timestamp)`.

```
                user
                 │  op::verify_claim
                 ▼
       ┌──────────────────┐
       │     verifier     │  parks (query_id → entry)
       └──────────────────┘
        │ op::query_registered      ▲
        ▼                           │ op::query_reply
       ┌──────────────────┐         │
       │     registry     │─────────┘
       └──────────────────┘
                                    │
       ┌──────────────────┐         │ op::mint
       │   collection     │◄────────┘
       └─────────┬────────┘
                 │ stateInit deploy
                 ▼
            soulbound item (per credential)
```

(SVG version: `contracts/design/async-flow.svg` once exported from
a diagramming tool. Markdown ASCII works for code review and ePrint
plaintext rendering.)

---

## 2. Parked-proof state machine

The verifier's `parked_dict` is a `HashmapE(64 → ^cell)` keyed on
query id. Each entry stores

```
nullifier        : 256 bits
app_id           : 64 bits
claim_type       : 32 bits
expiration       : 64 bits
parked_at        : 32 bits (Unix seconds)
ttl              : 32 bits
original_sender  : MsgAddress
```

States:

| State    | Transition                       | Trigger                    |
| -------- | -------------------------------- | -------------------------- |
| absent   | → parked                         | `op::verify_claim` accepts |
| parked   | → minted                         | positive `op::query_reply` |
| parked   | → absent (no mint)               | negative `op::query_reply` |
| parked   | → absent (no mint)               | admin `op::sweep_expired` past TTL |

`parked_at + ttl > now()` is the in-flight predicate. v0.2 sets
default `ttl = 3600` seconds (one hour). The TTL exists because TON
does not guarantee message delivery — a registry that never replies
would otherwise leak storage on the verifier.

The nullifier is **not** recorded at park time. It is recorded only
when a positive reply lands, *after* a re-check of expiration and
nullifier reuse. The re-check exists because:

- An adversary could park a proof, then mint a credential against the
  same nullifier via some other code path, then expect the parked
  proof's mint to succeed against an already-used nullifier. The
  re-check catches it.
- Time may have advanced between park and reply; the expiration
  re-check is cheap.

---

## 3. Bounce handling

Outbound messages from the verifier (`op::query_registered`,
`op::mint`) use `mode 1` (pay forward fees separately) with `bounce
= off`. Reasoning:

- If the registry is not deployed yet, the query bounces back to the
  verifier; with `bounce = on`, the verifier would receive a bounced
  message and must handle it. v0.2 keeps the verifier simple: bounce
  off, and the admin must wire `registry_addr` before any
  `op::verify_claim` arrives.
- If the collection is wedged, the mint would bounce. v0.3 will add
  a `bounce_handler` to retry; v0.2 keeps it simple and documents
  the risk.

`op::query_reply` from the registry uses `mode 64` (carry remaining
value of the inbound message). This lets the verifier's reply
processing draw on the gas left over from the original
`op::verify_claim`.

---

## 4. Gas budget per step

| Hop                       | Gas (sandbox, approx) | Notes |
| ------------------------- | --------------------- | ----- |
| `op::verify_claim` accept | 151 955               | dominated by `BLS_PAIRING` + 2× `BLS_G1_MULTIEXP` + park-dict update |
| `op::query_registered`    | _measure on testnet_  | dict lookup + outbound msg build |
| `op::query_reply`         | _measure on testnet_  | dict update + nullifier insert + outbound mint |
| `op::mint`                | _measure on testnet_  | stateInit hash + item deploy |

v0.3 fills the testnet column once Task D1 lands (deployer wallet).

---

## 5. Failure modes worth naming

- **`err::registry_unset` (433).** `op::verify_claim` arrives before
  admin wired the registry. Recoverable: admin sends
  `op::set_registry` then the user retries.
- **`err::collection_unset` (434).** Same shape, different field.
- **`err::not_registry` (430).** A non-registry tried to deliver a
  `query_reply`. The parked entry stays put.
- **`err::unknown_query_id` (431).** The `query_id` in the reply
  doesn't match any parked entry — either the entry was already
  swept, the user gave up, or the reply is bogus. Verifier rejects.
- **Verifier never replies** (network partition, registry crash). The
  parked entry sits until `op::sweep_expired` clears it.

---

## 6. What this design does **not** address

- **Multi-attestor sets.** The verifier still trusts a single
  attestor (whose pubkey arrives as a public input). Threshold or
  set-membership checks are v0.3+.
- **Cross-contract atomicity.** If the collection rejects the mint
  (e.g., it's paused), the nullifier was already recorded and the
  user gets no credential. v0.3 may move to a 3-message
  prepare/commit pattern.
- **Reply impersonation across registry rotation.** If admin rotates
  the registry address via `op::set_registry` while a query is in
  flight, the response from the *old* registry now fails the 430
  check and the parked entry sits until swept. Documented as
  acceptable in v0.2.

---

End of v0.2 Phase C async-flow design.
