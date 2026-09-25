/**
 * GAMING GATE, shard a — the fixtures `SHARDS.a` in `./gaming.ts` names, against every move.
 *
 * The gate itself lives in `./gaming.ts`; this file only WIRES it. `testing/` may not name
 * `app/` or `adapters/` (`../package-boundary.test.ts`), so the real `check` operation and
 * the real layers are handed in here, where a test is allowed to compose every ring.
 */

import { Effect } from 'effect'
import { embedderServiceLayer } from '../adapters/embedding/embedder.ts'
import { solverServiceLayer } from '../adapters/z3/solver-service.ts'
import { checkOp } from '../app/operations/check.ts'
import { MUTATE_OPTIONS } from '../app/operations/mutate-options.ts'
import { exitCodeForEnvelope } from '../app/runtime/exit.ts'
import { runOperation } from '../app/runtime/operation.ts'
import { describeGamingShard } from './gaming.ts'

describeGamingShard('a', {
  check: (input) =>
    runOperation(checkOp, input).pipe(
      Effect.map((envelope) => ({ exit: exitCodeForEnvelope(envelope), data: envelope.data })),
    ),
  solver: solverServiceLayer,
  envEmbedder: embedderServiceLayer,
  mutateOptions: MUTATE_OPTIONS,
})
