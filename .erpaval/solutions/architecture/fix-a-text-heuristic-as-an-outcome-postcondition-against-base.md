---
title: Fix a text heuristic in the decide path as an OUTCOME post-condition measured against base, under a corpus snapshot taken first — each new shape rule opens a new route to a wrong verdict
track: bug
category: architecture
module: src/domain/engine/parse/unbound.ts, src/domain/engine/parse/tier2.ts, src/domain/engine/lint/gtwr.ts
component: symspec
severity: high
tags: [parse, lint, heuristics, post-condition, parity, snapshot, fabrication, verified, adversarial-verify, divergence]
applies_when:
  - a fix changes how English is read on the way to the solver (parser, normalizer, lint that gates formal admission)
  - an adversarial fix loop reports MORE blocking problems each round instead of fewer
  - a defect is "the tool silently dropped/flipped part of the sentence"
pattern: |
  Spec 007 AC-2-2 (a leading `Unless …` clause was silently dropped) and AC-2-3 (a `not` inside the
  response flipped `negated`) were fixed three times as SHAPE rules: which leading tokens open a
  clause, which bracket groups are decoration, which determiners scope over the modal, where the
  subject starts. Each rule was right for the reproducer. Each also changed how ORDINARY lines parse,
  so the next verifier found a new fabricated ERR, a conflict that disappeared versus base, or a
  meaning flip. Measured: 2 -> 6 -> 13 blocking problems across three rounds, and the branch grew to
  1748 lines for two small ACs. The GTWR R6 "identifier numeral" fix diverged the same way
  (3 -> 6 -> 6): every widening of "this numeral is a label" admitted a real unitless amount to the
  formal tier, where it could not be compared, and `verified` went true.

  What converged, in one round each, was restating the AC as a property of the OUTPUT relative to
  base's output, not of the input's shape:
    - AC-2-2: compute the words before the modal that landed in NO stored slot; refuse only if that
      dropped span contains a marker. One rule covers plain, bracketed, hyphenated, word-number and
      punctuation-inside-subject forms, and it cannot fire on a line whose words all survived.
    - AC-2-3: start from base's flag; clear it only when the negator base keyed on is still present
      verbatim in the stored response. A negation anywhere else keeps base's value, so no subject
      shape can flip meaning.
    - R6: exempt a numeral only when it lies inside the quantity subject of a bound the numeric tier
      itself extracted with a recognized unit — one shared extractor, no lint grammar.

  The instrument that made each change reviewable was a corpus snapshot of the parse (or lint)
  result, committed BEFORE the fix, whose post-fix diff must contain only rows in the targeted
  class. Every changed row is argued in the commit body; an unexplained row is a regression by
  definition.

  THE RULE: when a decide-path text heuristic is wrong, do not add a better heuristic. Snapshot the
  current behaviour over a large corpus (fixtures, tests, README, eval rounds, every verifier repro),
  state the fix as a post-condition on the existing output, and require the snapshot diff to be
  exactly the targeted class. Parity with base is the default; every deviation is an argued row.
  Give adversarial verifiers the post-condition as their rubric, or they will re-litigate the
  design each round.
