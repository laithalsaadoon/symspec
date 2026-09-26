---
title: Admit a rewrite by exact partition equality, never by "equals the join" — a join is transitive, and a third use carries a merge nobody declared
track: bug
category: architecture
module: src/domain/vocabulary/outcome.ts, src/domain/vocabulary/invariants.ts
component: symspec
severity: high
tags: [vocabulary, projection, partition, union-find, transitivity, fabrication, hygiene, D10]
applies_when:
  - a validator admits a rewrite when the partition it produces equals some COMBINATION of what the engine reads today and what the author declared
  - two namespaces the author keeps apart share one key inside the engine (a feature and a state spelled alike are one guard atom)
  - a refusal appears for two requirements and disappears when an unrelated third requirement is added
pattern: |
  The vocabulary validator admitted a projection when P (the keys the engine reads on the
  projected document) equalled the JOIN of O (the keys it reads on the original) and D (the
  declared classes). The join was there to tolerate one designed disagreement: the encoder reads
  an optional-feature precondition in the `guard` namespace, so a feature and a state of one
  spelling are one atom in O and two symbols in D.

  A join is transitive. R1's STATE "logging is enabled" and R3's FEATURE "logging is enabled"
  are one O atom; a feature alias joins R2's feature "verbose mode is enabled" to R3's in D.
  The join therefore puts R1 and R2 in one class, the projection (R2 rewritten onto the shared
  spelling) reads them as one atom, P equals the join, and the check reports a fabricated
  error-severity FND_CONTRADICTION over R1/R2. The same vocabulary on {R1, R2} alone was refused;
  adding R3 admitted it. A validator that becomes more permissive when an unrelated requirement is
  added is admitting through an edge nobody declared.

  THE RULE:
    - The admission target is D itself. An undeclared use is classed by its O key in a namespace
      no declared class shares (the vocabulary says nothing about it, and the projection leaves it
      as written), never joined to a declared one.
    - Check O against D FIRST, on the original. Two uses on one O key in two D classes is not
      something a projection may resolve: splitting them deletes a conflict the engine decides
      today, and joining them is the undeclared merge. It is a hygiene refusal of the document
      (V-KIND), naming the phrase, both requirements and both symbols, and the implicit bootstrap
      (identity projection) reports the same refusal.
    - Declared classes are per SLOT, not per requirement. With per-requirement classing, dropping
      one rewriting alias left the whole requirement undeclared, and its other slots then collided
      with declared uses on their own O keys: a spurious hygiene refusal of every alias.
    - Synthetic probes that exist to measure declared phrases must not manufacture a collision the
      document cannot have: feature probes sit in their own probe system, since the engine joins a
      feature and a guard only within one system of the document.

  Sabotages recorded in the commit: the join restored fabricates the contradiction (verdict test
  red); exactness alone without the hygiene step already closes the verdict hole but loses the
  D10 report (hygiene tests red, verdict test green, which says the verdict hole is closed by
  exactness itself); per-requirement classing and a shared probe system each turn their tests red.
