# Changelog

## [2.1.0](https://github.com/laithalsaadoon/symspec/compare/v2.0.0...v2.1.0) (2026-10-09)


### Features

* **vocabulary:** S6 resolver chokepoint, implicit vocabulary and invariants (pure) ([#20](https://github.com/laithalsaadoon/symspec/issues/20)) ([49b37c6](https://github.com/laithalsaadoon/symspec/commit/49b37c6a700a7915df36c7fbe41a93a19baa7b56))


### Bug Fixes

* **lint:** force-ignore .claude so biome ci survives nested worktree configs ([9605b2c](https://github.com/laithalsaadoon/symspec/commit/9605b2c884692d82a281724c3135c6fe5c467e3b))
* **lint:** force-ignore .claude so biome ci survives nested worktree configs ([0cbfac5](https://github.com/laithalsaadoon/symspec/commit/0cbfac562173602e5a143017c5a17820e276a299))

## [2.0.0](https://github.com/laithalsaadoon/symspec/compare/v1.2.1...v2.0.0) (2026-10-06)


### ⚠ BREAKING CHANGES

* **waivers:** code-only, hash-less single-ref and never-class waivers stop applying. waive, apply and import refuse a waive of a never-class code (verdict, disclosure, triage, hygiene, anchor), of an unpublished code, or with no requirement scope, with ERR_WAIVER_REFUSED; a ref is stored as refs [ref] plus the content hash. Stored waivers in those shapes (and hash-less refs) go inert: check ignores them and discloses each as an info waiver-inert diagnostic carrying its unwaive op and, for a wording or structural code, scoped replacement waive ops; stale-hash waivers are listed in data.ignoredWaivers. A waived blocking lint now demotes waived-blocking-lint, so it never yields verified true.

### Features

* **config:** pin the gate's run settings in symspec.config.json, and init --split ([0d0b8a0](https://github.com/laithalsaadoon/symspec/commit/0d0b8a0ede200309a0e7df2ba4521e3b1aa3f1ca))
* **document:** format v4 schema with the vocabulary, intent and policy ([38bb6fc](https://github.com/laithalsaadoon/symspec/commit/38bb6fc41e0d55f0b862ba323f6049f1d9dfeb6f))
* **numeric:** disclose a quantity no read bound covers as FND_NUMERIC_UNCOMPARED ([1dcf401](https://github.com/laithalsaadoon/symspec/commit/1dcf401b5472d9aced42639b60924c9d4a7166f1))
* **ops:** op directions and signal classes as data, measured by G-D ([4502693](https://github.com/laithalsaadoon/symspec/commit/450269355938220ea98ad3f9f4d24649d002a026))
* **waivers:** enforce waivability: refuse never-class and unscoped waivers, inert stored ones ([7afb20e](https://github.com/laithalsaadoon/symspec/commit/7afb20e6bfbd4b937465662ceaba3c60742e9bc2))


### Bug Fixes

* **advice:** bind the numeric/relational repair waiver to its finding's ids and text ([b3a7c03](https://github.com/laithalsaadoon/symspec/commit/b3a7c03d96b377f1b43658dd6c4347be1d1678c3))
* **advice:** scope a pair demotion's waiver op to its own pair ([73f627e](https://github.com/laithalsaadoon/symspec/commit/73f627ee92c4b2d1a132d74bcac22c353748f719))
* **advice:** scope the numeric/relational waiver repair to its own pair ([57a677c](https://github.com/laithalsaadoon/symspec/commit/57a677c6c493e3e5cc4bb784f45401bcfe692dca))
* **atomize:** keep a `,` or `.` between two digits inside its number ([5f4de78](https://github.com/laithalsaadoon/symspec/commit/5f4de7803dfdb90f6e9495e6df06c123801074e4))
* **check:** a run on the stub embedder demotes with run-weakened and discloses data.run ([a093538](https://github.com/laithalsaadoon/symspec/commit/a0935382f72812d650cff867bf788c50c79704b2))
* **check:** disclose FND_REACHABILITY_NOT_CHECKED when no state model is committed ([77f03b4](https://github.com/laithalsaadoon/symspec/commit/77f03b4e12b4921b0b5256ee3cae958236478094))
* **cli:** every flagged command site carries only shell words (R63, R64) ([ae268e3](https://github.com/laithalsaadoon/symspec/commit/ae268e342693500ddb309d7e82e35299043d056d))
* **cli:** every printed command is shell-safe and names full arguments (R60, R61) ([6f7e957](https://github.com/laithalsaadoon/symspec/commit/6f7e95799ae7e107b99aee110aea5096469918f8))
* **config:** a git refusal with no config anywhere falls back and discloses ([a158480](https://github.com/laithalsaadoon/symspec/commit/a1584802f31080ee0fa4100b28e2c27c2b458137))
* **config:** a nested .git is a toplevel only when the enclosing repository agrees ([5ed7bc9](https://github.com/laithalsaadoon/symspec/commit/5ed7bc9f49b02c0e4ad337aa68137a0ea82253c1))
* **config:** find the config with git rev-parse, name it with --config, disclose where it came from ([e755084](https://github.com/laithalsaadoon/symspec/commit/e755084a61252eaabbba682dd249a7bf067e48a7))
* **config:** recognise the bare refusal by git's form; a dangling config link is present ([36bb975](https://github.com/laithalsaadoon/symspec/commit/36bb975211207a5716071646f13f25ff2c9d9b3d))
* **config:** refuse a committed bare-repository layout as the toplevel ([50ea778](https://github.com/laithalsaadoon/symspec/commit/50ea7780e0ec7ed017e339bc5ba2ad9a99238ef9))
* **config:** take only git's whole discovery message for "no repository" ([86492ea](https://github.com/laithalsaadoon/symspec/commit/86492ead99c5717a1bc8dd5c90b9024c6d8a8cc0))
* **config:** trust only a real .git as the toplevel, and make the pin repair converge ([ef7e105](https://github.com/laithalsaadoon/symspec/commit/ef7e105a1bfea10451e78494d40a4f8c7c12abfb))
* **document:** label the v4 vocabulary, intent and policy keys experimental ([ca83661](https://github.com/laithalsaadoon/symspec/commit/ca83661ee3ce4c852a77b62f08e69123f0df9bfb))
* **document:** nested v4 descriptions say what a later release will do ([6509f0f](https://github.com/laithalsaadoon/symspec/commit/6509f0f0f76f5322bdb3f0d206eabd71764558e7))
* **engine:** a --semantic-threshold above the default demotes as run-weakened ([88af88d](https://github.com/laithalsaadoon/symspec/commit/88af88d67dd77f2d6e53f1b814eaf7916c7f2353))
* **engine:** a glossary alias carries its phrase's contraries ([425372e](https://github.com/laithalsaadoon/symspec/commit/425372e0a00c844ef72a9af56fc6faa37d74fe71))
* **engine:** a glossary entry never merges two contraries onto one atom ([a170157](https://github.com/laithalsaadoon/symspec/commit/a1701576bb0889fd50b72369cba2815c1c51efeb))
* **engine:** AC-3-2 demotes contrary pairs under guards no checked group joins ([ef3a5e3](https://github.com/laithalsaadoon/symspec/commit/ef3a5e34ce77bc1eb559703dfe524c25e89b929a))
* **engine:** an exact-set waiver suppresses only the finding over exactly its ids ([a702d6b](https://github.com/laithalsaadoon/symspec/commit/a702d6bf03f2c8c527fc88a6575d088d85b3179d))
* **engine:** apply the governed-preposition rule to every antonym row ([d1dc7de](https://github.com/laithalsaadoon/symspec/commit/d1dc7dec8cbe48a695bfafb92c1c76bf765f156e))
* **engine:** check "shall not only X but also Y" as a positive obligation ([8879845](https://github.com/laithalsaadoon/symspec/commit/88798451faccaf8c245665c79ede87e4f2e141e2))
* **engine:** coverage prose names the real reason no pair was compared ([d8fa1af](https://github.com/laithalsaadoon/symspec/commit/d8fa1afba1a42df0c598fe586a83caf924369a40))
* **engine:** delete the two preposition guesses that widened a proof ([8aeb330](https://github.com/laithalsaadoon/symspec/commit/8aeb330155d1d02ff4ace466ceebaa946e7db1bc))
* **engine:** demote on an opposite-polarity pair that differs only in inflection or number ([f25d6d1](https://github.com/laithalsaadoon/symspec/commit/f25d6d14480718abbd68b7e22dd082f1c3ee23c2))
* **engine:** demote verified with solver-unknown when the contradiction enumeration hits unknown ([8056269](https://github.com/laithalsaadoon/symspec/commit/80562696c748b001802e56d5037b4623b9bd00b9))
* **engine:** demote, never certify, the pairs the antonym split stopped relating ([07e66d5](https://github.com/laithalsaadoon/symspec/commit/07e66d561fa518cff2666222bb55efe93aeeb79a))
* **engine:** demote, never prove, two responses apart only by their prepositions ([92e51a2](https://github.com/laithalsaadoon/symspec/commit/92e51a2c31c06e45895d78b01a831ac49ad6cb0f))
* **engine:** discharge an opposition candidate only by its exact, text-bound pair waiver ([661c933](https://github.com/laithalsaadoon/symspec/commit/661c9334ed607e5c7345bb39d21a6982e7eade0f))
* **engine:** disclose opposed numeric bounds under guards never asserted together ([8404e95](https://github.com/laithalsaadoon/symspec/commit/8404e95c9c30ab34188f6ee8e05422be9abae42f))
* **engine:** disclose prohibition sets that conflict only all together ([12e7ed8](https://github.com/laithalsaadoon/symspec/commit/12e7ed8192f302da73fa9feee3558b6669e27c52))
* **engine:** each antonym verb drops only its own governed preposition ([b765b3f](https://github.com/laithalsaadoon/symspec/commit/b765b3fec3eee8907841b9f13e49919f306ecba3))
* **engine:** give an unmarked time bound before other text its own role ([5a7bbe6](https://github.com/laithalsaadoon/symspec/commit/5a7bbe6eb85babef57220190579590bb24898537))
* **engine:** govern every preposition that names the place, per verb and per place ([361d228](https://github.com/laithalsaadoon/symspec/commit/361d2282205b23a32de170161e3a86fbc39cbdd1))
* **engine:** govern no `within`, and delete the deadline word list ([e327e47](https://github.com/laithalsaadoon/symspec/commit/e327e471a1b1f65bb6974e70258484bf68304253))
* **engine:** govern no locative, so two different locatives are never one key ([cbc9e25](https://github.com/laithalsaadoon/symspec/commit/cbc9e2516966367944ba542be72ae79b9463bdbf))
* **engine:** keep a bound's trailing condition, and never compare across it ([5d9d65c](https://github.com/laithalsaadoon/symspec/commit/5d9d65c44d244d1aa7af07410d78564e527811a6))
* **engine:** keep a digit separator inside its number in the quantity key ([8f3a8b1](https://github.com/laithalsaadoon/symspec/commit/8f3a8b170ebe219f7ff4d6cfa3752f15c24dd2be))
* **engine:** keep direction prepositions; drop only a class-governed one from the key ([3c2617d](https://github.com/laithalsaadoon/symspec/commit/3c2617ddf2defd6e26a0e6f3145af476aeb4ecbd))
* **engine:** key a bound response's action too, disclose one behind other words, and read every asserting complement's copula ([9cfe844](https://github.com/laithalsaadoon/symspec/commit/9cfe844b769f1a714a0ca738589c3ff4dc165336))
* **engine:** key an action's performance as a bound's subject, in every unit class ([4cdbb92](https://github.com/laithalsaadoon/symspec/commit/4cdbb927a6da02f965ae340e7365e35eca07e6c1))
* **engine:** key numeric quantities, relational groups and plan systems by the atom scope ([54ce198](https://github.com/laithalsaadoon/symspec/commit/54ce1986bee17eb02bdd489b2765d96103853ec4))
* **engine:** leave a bound in one cell when no clause holds it ([43e378f](https://github.com/laithalsaadoon/symspec/commit/43e378f54f406a79069216aa8a6ece0b7f18b3b9))
* **engine:** link a contrary glossary alias to its entry instead of dropping the equivalence ([abb812e](https://github.com/laithalsaadoon/symspec/commit/abb812e4d97b0ebad863e39b31dbcb7c9b3016b5))
* **engine:** participation means co-live in a decided group; demote unchecked conditional conflicts ([28a8fc2](https://github.com/laithalsaadoon/symspec/commit/28a8fc25e052c37e78ab1b68e0c30e09a4f15609))
* **engine:** propose the AC-3-6 glossary merge in canonical space, never over a contrary pair ([ffcfdbd](https://github.com/laithalsaadoon/symspec/commit/ffcfdbd6a833595cae2248faeee8329b0d5a0bed))
* **engine:** prove a numeric pair only on exact keys, and disclose every clause a spelling marks ([8c6f0be](https://github.com/laithalsaadoon/symspec/commit/8c6f0be86e651bac53ecea094d295bd43aca34cc))
* **engine:** prove a response bound only after one noun, a holding verb's time, or a verb alone on a time ([a244027](https://github.com/laithalsaadoon/symspec/commit/a2440270bad93b20d9c55867c6d8a2064efadbe3))
* **engine:** prove a response bound only where the sentence says it holds the quantity ([79a3369](https://github.com/laithalsaadoon/symspec/commit/79a33698db31b700bd1853df1e21c931f8e7cffe))
* **engine:** prove a role-marked bound only on a recognized time ([57da786](https://github.com/laithalsaadoon/symspec/commit/57da78612f73e4c9e7c7318a052decf86788e924))
* **engine:** read a bound in a response's subject clause by its finite verb too ([f71b2dd](https://github.com/laithalsaadoon/symspec/commit/f71b2ddb855fbe6bb5a1df356d728e532b608123))
* **engine:** read a bound inside a condition with its whole clause ([6e00b4d](https://github.com/laithalsaadoon/symspec/commit/6e00b4dff3d7cbd1dbbfce8d1d2d6ff318a295a5))
* **engine:** read a duration after a postmodifier as the object's, not the action's ([b2b16cd](https://github.com/laithalsaadoon/symspec/commit/b2b16cdfa3e4de46127c774c6f2836e673bd1c6c))
* **engine:** read a negated numeric bound as a prohibition, not an obligation ([7f13362](https://github.com/laithalsaadoon/symspec/commit/7f1336232554b4af9953519f08e442f6fcfd15eb))
* **engine:** read a percent as its own dimension and disclose it against a bare number ([966dbc3](https://github.com/laithalsaadoon/symspec/commit/966dbc33765aa7e89550a26abc36446f302c748c))
* **engine:** read a response that does an action with no bound as doing it ([5029c9f](https://github.com/laithalsaadoon/symspec/commit/5029c9f760267e8c9cd69b7955cbda639f616c14))
* **engine:** read a two-token antonym head whole in the opposition-candidate tier ([17b79cf](https://github.com/laithalsaadoon/symspec/commit/17b79cf036858852c4f30af751868ebf98b7079f))
* **engine:** read all text after a numeric bound as its qualifier ([1767891](https://github.com/laithalsaadoon/symspec/commit/17678912b4ed8ad31bf0921708c6daa0ddae2495))
* **engine:** read days and weeks as civil time against a bounded day length ([f146a64](https://github.com/laithalsaadoon/symspec/commit/f146a64d8e18fe933c0375c0f10ce4ecbd43361e))
* **engine:** read every dash that leads a number as the minus sign ([09b4eb4](https://github.com/laithalsaadoon/symspec/commit/09b4eb4ed82cef3e64c11330d7c18997cb11560f))
* **engine:** read only the first place preposition as the verb's own place ([e13a56a](https://github.com/laithalsaadoon/symspec/commit/e13a56a04712036804983c23ae4aecd290a14d0d))
* **engine:** read scientific notation in a numeric bound with its exponent ([975a9fd](https://github.com/laithalsaadoon/symspec/commit/975a9fdafe5e59fe07536e4294da436015a81924))
* **engine:** relate antonyms only by their pairs; same-side verbs keep their own atoms ([a5a8247](https://github.com/laithalsaadoon/symspec/commit/a5a82470eb3884d14daea8ab0b0ed7819e3e1eb4))
* **engine:** report a numeric core only among requirements that can apply at once ([c92ad5f](https://github.com/laithalsaadoon/symspec/commit/c92ad5f1b55b5d70a7dc629cab1a7bc5016c9f81))
* **engine:** restate the AC-3-6 near-duplicate rule for AC-2-1 contraries ([8d015e3](https://github.com/laithalsaadoon/symspec/commit/8d015e319472f800833035d4b21d2109f50592b4))
* **engine:** run the AC-3-6 inflection test on canonical response bodies ([2e9e8ce](https://github.com/laithalsaadoon/symspec/commit/2e9e8ce5e3ec25bbfcd41f9f35bed9885b671d49))
* **engine:** scope every candidate repair waiver to its exact pair and text ([fac40ab](https://github.com/laithalsaadoon/symspec/commit/fac40ab75591a8dce6bbf822d614b6833be6bd11))
* **engine:** scope every propose-tier pair by the atoms' system scope, not the raw name ([eb3c19f](https://github.com/laithalsaadoon/symspec/commit/eb3c19f32e6a3fc1d559ba6a6942010e3acd81fd))
* **engine:** split no bound off a subject that holds no clause ([b5472d5](https://github.com/laithalsaadoon/symspec/commit/b5472d5c76a6a4151d6bf473f080d5154880d8d6))
* **engine:** the AC-3-6 merge reads the solver's rows and never splits a shared atom ([cec61dc](https://github.com/laithalsaadoon/symspec/commit/cec61dc021d82564ddda8522adc9ecf1fa26bf46))
* **engine:** write the cross-side contraries the antonym classes meant as explicit seed rows ([f15c48c](https://github.com/laithalsaadoon/symspec/commit/f15c48c9d3dbef8469ac5f2816ec9e8fdf6c4df9))
* **formal:** demote a pair whose numbers differ only in a digit separator ([ce5fe2e](https://github.com/laithalsaadoon/symspec/commit/ce5fe2eb0156241894e53488819b7bfaf041feca))
* **formal:** encode opposition as a contrary axiom, never a rename ([a6e087d](https://github.com/laithalsaadoon/symspec/commit/a6e087d0b1a62355fe89bbafa2e5e509f22db415))
* **formal:** fold committed glossary and term aliases in the number-spelling finder ([224d301](https://github.com/laithalsaadoon/symspec/commit/224d301f43aff1c6a4d19a7671d42ff42d06b074))
* **formal:** keep case after a number only for unit tokens ([956215e](https://github.com/laithalsaadoon/symspec/commit/956215ef8dace7bd98d55524522d6b3a86685270))
* **formal:** keep every script's letters, the minus sign and unit case ([0540279](https://github.com/laithalsaadoon/symspec/commit/0540279006c94a643e5929b87001c9fa93754d72))
* **formal:** normalization deletes only identity-free punctuation ([47603f1](https://github.com/laithalsaadoon/symspec/commit/47603f13c08c6885dc7917f9b6c7584626872ed6))
* **formal:** same-side antonym class members stay one atom ([7af9f05](https://github.com/laithalsaadoon/symspec/commit/7af9f05f87120acd505f40f1e5809a397696ba06))
* **formal:** trigger and precondition share one guard namespace ([414fa43](https://github.com/laithalsaadoon/symspec/commit/414fa43d622ff65d7ef56275718e58c7e7cf1952))
* **formal:** withhold event-driven guard-implication bridges from the snapshot ([752a4ee](https://github.com/laithalsaadoon/symspec/commit/752a4eed08f6732af3256bef3eed977fe8c07ad5))
* **import:** exit 1 when a write fence refuses a record, still writing the rest ([73be341](https://github.com/laithalsaadoon/symspec/commit/73be341737e242c6b39230c29adf4d3b0b66237a))
* **import:** fold side-table records through apply's fences, in stream order ([b6d5f1b](https://github.com/laithalsaadoon/symspec/commit/b6d5f1b3d5a08de13106602df31b6f05d7543242))
* **lint:** exempt an R6 numeral only after a noun whose instances are numbered ([6edd9de](https://github.com/laithalsaadoon/symspec/commit/6edd9de05227bec8ad78c9e89b80e046d56406ea))
* **lint:** read a numeral that names a converted bound's quantity as a label in R6 ([da9d61c](https://github.com/laithalsaadoon/symspec/commit/da9d61cfb8d433b0e44c3e37ea53d88670cc51ad))
* **lint:** read an `_` between two digits as an R6 digit-group boundary ([05632b8](https://github.com/laithalsaadoon/symspec/commit/05632b8af7d78a1eb8ab8713f6fcfa0696cacd68))
* **lint:** read an R6 digit run inside a number the numeric tier read with a unit ([50ad2d5](https://github.com/laithalsaadoon/symspec/commit/50ad2d54f004ee8ea31edbd18cee6b50be5f3eaf))
* **lint:** read an R6 identifier numeral only after a numbered noun a quantity verb governs ([89708cb](https://github.com/laithalsaadoon/symspec/commit/89708cbf451aa1a244967f5fe51ade529696edb8))
* **lint:** read R6 units off the numeric tier's unit table ([18a7f06](https://github.com/laithalsaadoon/symspec/commit/18a7f068c0fc8b4457f8bbf969d09ac61fded40d))
* **numeric:** decline a number grouped by `_`, a quote, or a space ([77343c1](https://github.com/laithalsaadoon/symspec/commit/77343c152a2467236bc62cb2f5453d6a63f0b8f8))
* **numeric:** key bounds on (quantity, dimension, unit) with exact conversion ([6cdba7e](https://github.com/laithalsaadoon/symspec/commit/6cdba7e50edff1ab50d70f7f32ae986491b0b0d3))
* **numeric:** prove only under every reading, disclose what the readings split ([7defbfc](https://github.com/laithalsaadoon/symspec/commit/7defbfccd9d5b3114ef3b22fc73b8b2ba5a5d159))
* **numeric:** read bounds through negation, role, and the whole subject ([64da7ad](https://github.com/laithalsaadoon/symspec/commit/64da7addaed9377da1dc3e5b5f1f27d26d4ad6ae))
* **numeric:** read more than, fewer than, up to, and the other missing comparators ([7a77050](https://github.com/laithalsaadoon/symspec/commit/7a770501567eceb2b7b54615d342950062d3dda1))
* **numeric:** read more/fewer than or equal to as one bound ([277aa78](https://github.com/laithalsaadoon/symspec/commit/277aa78b626123b5db0d19869f35e1f6f7621adb))
* **numeric:** up to is not a comparator, and a leading-decimal quantity is seen ([f1d26d7](https://github.com/laithalsaadoon/symspec/commit/f1d26d74c91a7b10728e3066aef516917fc56da9))
* **ops:** an alias is weakening, strengthening may only displace, and G-D measures both ([3fb1224](https://github.com/laithalsaadoon/symspec/commit/3fb1224f0acc557827e2620cbb5ec78aae7240a6))
* **ops:** antonym is weakening, and displacement is defined per tier by its reporting granularity ([e45db17](https://github.com/laithalsaadoon/symspec/commit/e45db17d1399b43b29efdf95b0f08c0cddd1a4e0))
* **ops:** unwaive is weakening, a dangling edge is hygiene, waivability says it is not enforced ([00c04ea](https://github.com/laithalsaadoon/symspec/commit/00c04ea04c1c18ae68c3f9b1e320bfe8ac7d7389))
* **parse:** a hyphen neither hides a dropped marker nor stands in for the negator ([d8f2af2](https://github.com/laithalsaadoon/symspec/commit/d8f2af20bed86139ea80bce97a710fc68124163d))
* **parse:** a subject negator sets `negated` only when it opens the main clause ([913a645](https://github.com/laithalsaadoon/symspec/commit/913a645c29c608a4fdf835ae0db5f7f51091ee0b))
* **parse:** AC-2-2 and AC-2-3 as outcome post-conditions over base's parse ([138f9fd](https://github.com/laithalsaadoon/symspec/commit/138f9fd163c8ff08a324b3f5dc7d0f438f6743a7))
* **parse:** find an unbound clause after any clause boundary, and before a bare subject ([18af998](https://github.com/laithalsaadoon/symspec/commit/18af99801107186a8bc912aee0927d83fc19b2b1))
* **parse:** find an unbound clause behind decoration, and only where it ends before the subject ([394e41a](https://github.com/laithalsaadoon/symspec/commit/394e41af6ab5a49541978ecf988ea36ac5eaac72))
* **parse:** keep `negated` for every negation that governs the modal ([5c0a52b](https://github.com/laithalsaadoon/symspec/commit/5c0a52bb18085c44a75aeb85531b5a4dc42acd0f))
* **parse:** measure the AC-2-2 dropped span against the modal the tier pivoted on ([1b56038](https://github.com/laithalsaadoon/symspec/commit/1b560382eb9e5d7d4a681a90a3bf87c130108dba))
* **parse:** name the whole dropped clause, and gate the AC-2-2 word-membership fallback ([2735750](https://github.com/laithalsaadoon/symspec/commit/27357504976f4a68f151f7bb1c24ddb929958e6c))
* **parse:** read an apostrophe-less contracted modal ("wont", "shant", "mustnt") as negated ([7532a3b](https://github.com/laithalsaadoon/symspec/commit/7532a3b1bf10df16dfdf85a6c810d290e26cbbb8))
* **parse:** refuse an unbound leading clause with ERR_CLAUSE_UNBOUND ([4d67461](https://github.com/laithalsaadoon/symspec/commit/4d6746143aeaa0311d5e8c8d7457908ee9309014))
* **parse:** set `negated` only from a negation that governs the modal ([31fda7e](https://github.com/laithalsaadoon/symspec/commit/31fda7e2315be933ff0639c299e943ac1c1295f6))
* **reachability:** bound the cross-check by distinct states and withhold proofs it cannot examine ([28e66ba](https://github.com/laithalsaadoon/symspec/commit/28e66ba7740b5afec5bd2c9dad1cb98739506092))
* **reachability:** cross-check every small-model proof by explicit-state search ([a33ae93](https://github.com/laithalsaadoon/symspec/commit/a33ae9358aaaaf2dd95a55c4475b4387653ade00))
* **reachability:** cross-check many-free-set models and keep a lone int bound on computed initials ([28f2274](https://github.com/laithalsaadoon/symspec/commit/28f2274db410e857b12ffe71319e9645d0b0184c))
* **reachability:** let a free variable keep an out-of-range value so the frames nest ([65bb3b3](https://github.com/laithalsaadoon/symspec/commit/65bb3b3fe70443f76416b5f70dd68d4a4c870842))
* **reachability:** make `frame` decide the verdict it documents; ship an applicable repair; exit non-zero on a refused batch op ([f1edf90](https://github.com/laithalsaadoon/symspec/commit/f1edf902dd3803523d61ee1085edf36a71c0a1fd))
* **reachability:** reconstruct counterexample traces from the solver's state sequence ([407ff09](https://github.com/laithalsaadoon/symspec/commit/407ff090438007b53addfe29fc85f120f0d5ba62))
* **reachability:** report an out-of-range write as FND_RANGE_VIOLATION instead of disabling the step ([6d74bbb](https://github.com/laithalsaadoon/symspec/commit/6d74bbb2e8d8c7930973f1de8fcabdd647ab82c2))
* **reachability:** resolve enum members against the sort the type checker assigned ([093abc7](https://github.com/laithalsaadoon/symspec/commit/093abc72c7f3ede75c2c8b5e4743a57331c5bbd4))
* **reachability:** size the explicit-state cross-check by the states it visits ([ebdeb57](https://github.com/laithalsaadoon/symspec/commit/ebdeb57d6baec562303e0364f314b508267d4a7c))
* **reachability:** the feasibility gate's provable fixture declares the frame its proof needs ([01cffbb](https://github.com/laithalsaadoon/symspec/commit/01cffbb3d68d3a88e2ea6cd681e36e01c2c92597))
* **release:** repoint repository, homepage and bugs to laithalsaadoon/symspec ([16905f2](https://github.com/laithalsaadoon/symspec/commit/16905f2eab5b9fdb43bd277b505ef5d06789c2fa))
* **solver:** re-issue Z3_interrupt until a cancelled query settles ([3f96ea9](https://github.com/laithalsaadoon/symspec/commit/3f96ea96631f2d79d9a357bbbb30de2f6d0d4d58))
* **state-model:** refuse keyword-shaped names under case folding; keep integer literals exact ([1567dd1](https://github.com/laithalsaadoon/symspec/commit/1567dd1e8a44f080d3147eccd7ab7b46352e1a90))
* **temporal:** a bounded UNSAT that rests on the within-k premise is warn ([04da7ab](https://github.com/laithalsaadoon/symspec/commit/04da7ab182e59f084ff4f636e207422dc75e98da))
* **temporal:** read unwanted-behavior as the response obligation G((P ∧ T) → F R) ([f5a0d23](https://github.com/laithalsaadoon/symspec/commit/f5a0d238be6c31f2205705f8f7fb2a560deac909))
* **term:** refuse an alias that overlaps a committed phrase, from either side ([541328a](https://github.com/laithalsaadoon/symspec/commit/541328a5df53968af9425e5c1ce3223206478832))
* **waivers:** an unwaive ref that a stored waiver names is that id first (R59) ([be4516f](https://github.com/laithalsaadoon/symspec/commit/be4516fef3b3216c8f8b1ae78cf10955cacd05ef))
* **waivers:** apply crossed scoped waivers to terminology findings (R57) ([c66eecf](https://github.com/laithalsaadoon/symspec/commit/c66eecffc297ad6f5c0fd2b3dd6ccea6cda46917))
* **waivers:** cross a stored waiver only in the shape the fold stores (R54) ([b2c2713](https://github.com/laithalsaadoon/symspec/commit/b2c27137b156a379cc8cef1f716bb396bc9cb297))
* **waivers:** name only commands the CLI parses, no never-code waive prose (R56) ([d3db1d0](https://github.com/laithalsaadoon/symspec/commit/d3db1d071d27fe18f987e06607c79bde75492a79))
* **waivers:** unwaive removes only the stored waiver it names (R55) ([5264605](https://github.com/laithalsaadoon/symspec/commit/52646051387c44d7a888c4c3e455a86a6f63b885))

## [1.2.1](https://github.com/theagenticguy/symspec/compare/v1.2.0...v1.2.1) (2026-08-29)


### Bug Fixes

* **atomize:** a scope is never empty, and never eats an article ([e0e48ea](https://github.com/theagenticguy/symspec/commit/e0e48eaa7a0903848f10ddbb330a1de3d99f89d5))
* **atomize:** a symbolic comparator must survive normalization ([282a3b6](https://github.com/theagenticguy/symspec/commit/282a3b6562d7ebf5cc89997bde27446fd5affc2d))
* **check:** a guard is both EARS slots, so two exclusive states are two contexts ([e035458](https://github.com/theagenticguy/symspec/commit/e0354588f9c9354039eaf8318a23f39c49ebba7a))
* **check:** an "I don't know" is not a comparison, so it must not certify ([ffaad06](https://github.com/theagenticguy/symspec/commit/ffaad066295efec4e483ad723002420076d81953))
* **check:** an eligibility-only finding is not a comparison, so it must not certify ([c3c5203](https://github.com/theagenticguy/symspec/commit/c3c5203d3c56f30c3331652069ca6827b2ffea68))
* **contradiction:** a culprit set is the document's, not the solver's iteration order ([cabb8c6](https://github.com/theagenticguy/symspec/commit/cabb8c67878d92aa34c191d171e47235635fec7a))
* **numeric:** a quantity subject is the whole phrase, not a three-word window ([33ece44](https://github.com/theagenticguy/symspec/commit/33ece44f16698fdf28462893ef4e1154d747070b))
* **relational:** a discloser wants a COARSER key than the prover it shares one with ([6cdcc49](https://github.com/theagenticguy/symspec/commit/6cdcc493c198b9bdfd58289c793fce3b6f8c5cc2))
* **subsumption:** a degenerate body relates two formulas, not two requirements ([8681348](https://github.com/theagenticguy/symspec/commit/8681348823aacd73b0995fdabd44dd7953d0878f))
* three error-severity fabrications, and the gates that were missing ([b20e371](https://github.com/theagenticguy/symspec/commit/b20e37123b7f7de94d82f7449c4e5a2dd87a293f))

## [1.2.0](https://github.com/theagenticguy/symspec/compare/v1.1.0...v1.2.0) (2026-08-18)

> ### Upgrade note — this release contains a correctness fix on an already-published surface
>
> [`fbe4e67`](https://github.com/theagenticguy/symspec/commit/fbe4e67610d0c5b09b7368a1f9b6acb62957f48d)
> (*a committed table must not invert a state bridge*) is listed below among the vocabulary
> work it shipped beside, but it is independent of it and it is the entry to read first.
>
> **It closes a fabricated `FND_CONTRADICTION` at error severity — a conflict reported against
> a document that contains none — reachable through `symspec glossary`, which has shipped since
> 1.0.0.** A committed glossary (or the new `terms`) entry that rewrites a response's leading
> verb desynchronised two readings of one sentence: the guard-implication tier recognises a
> state bridge from the RAW sentence while computing its polarity from the ATOMIZED form, so the
> implication it asserted into the whole-spec conjunction was the negation of what the author
> wrote. The inert-implication filter compares atom names rather than polarity, so it did not
> catch one. The result is exit code 1 on a clean document, which for a tool whose contract is
> "sound modulo atomization" is the worst failure available to it.
>
> Reproduced on the built binary through both doors before the fix, and fixed at the point of
> inference rather than in either write path — committing a clean term and a document antonym
> in either order composes the same desync past any write-time validation.
>
> **If you commit glossary entries, re-run `symspec check` on this version.** A contradiction
> you could not account for may have been this. A dropped bridge is a miss, which is the only
> direction a sound checker may move, so the fix can cost you a proof but never invent one.

### Features

* **check:** splice the terminology tier where it cannot reach the verdict ([a74d2fe](https://github.com/theagenticguy/symspec/commit/a74d2fe16f29991152b770e9db71385e8a148a91))
* **propose-glossary:** align GUARD vocabulary, the slot that decides what gets compared ([59969d9](https://github.com/theagenticguy/symspec/commit/59969d96dd005d22bdab0393d66a16ba39f9befe))
* **propose-glossary:** offer the NOUN behind a phrase class, with its blast radius ([358d8b1](https://github.com/theagenticguy/symspec/commit/358d8b1d225449649e4f7b1c1e4dcdff0b0b49aa))
* **propose-glossary:** report every opposition, not only the ones a merge threatened ([b3b79ba](https://github.com/theagenticguy/symspec/commit/b3b79ba63a38c9d6322423c2555c521257fb64e6))
* **terminology:** the dual of the synonym bridge, at a measured floor ([c47d20c](https://github.com/theagenticguy/symspec/commit/c47d20c6a4264229bf55be265389851dd856343d))
* **terms:** a committed noun-phrase table, so one entry aligns a noun document-wide ([8a38938](https://github.com/theagenticguy/symspec/commit/8a389389c6c04db529034366174cb7a452f36c56))
* whole-document vocabulary alignment — guard slots, terms, and the terminology tier ([8fcdac7](https://github.com/theagenticguy/symspec/commit/8fcdac7cae6e8db6a43563d7734272461456e49c))


### Bug Fixes

* **formal:** a committed table must not invert a state bridge ([fbe4e67](https://github.com/theagenticguy/symspec/commit/fbe4e67610d0c5b09b7368a1f9b6acb62957f48d))
* **glossary:** a dead withhold reason, and a plan that split what it aligned ([473fbc5](https://github.com/theagenticguy/symspec/commit/473fbc5a3c6f0b79fe5967b3b015f30b4c99687c))
* **lint:** R37 stops claiming a glossary check it never ran ([a296926](https://github.com/theagenticguy/symspec/commit/a2969262938604582ee09f25358da6af9d931634))
* **publish:** gate the two code counts that had no gate, and the one that had half ([ed9e12f](https://github.com/theagenticguy/symspec/commit/ed9e12f94ba776a91067658ae8bd46dd591a57b3))

## [1.1.0](https://github.com/theagenticguy/symspec/compare/v1.0.1...v1.1.0) (2026-08-14)


### Features

* **adversarial:** restore the searcher, and close two bug classes with swept gates ([0f446e0](https://github.com/theagenticguy/symspec/commit/0f446e03db584734b93a71781914b4a8007fa1b0))
* **propose-glossary:** design the vocabulary across the whole document, not pair by pair ([a0b910e](https://github.com/theagenticguy/symspec/commit/a0b910e722f64d4f9ab45dba745e875376f3845b))


### Bug Fixes

* **engine:** the two defects the freeze kept as footnotes, red-first ([ed16eb9](https://github.com/theagenticguy/symspec/commit/ed16eb93695d660cb190f2c956a31be108d1034c))
* **repair:** every command the tool tells you to run, runs — and the README says why ([90b8c10](https://github.com/theagenticguy/symspec/commit/90b8c10f769bef1dbcbd4ee52c638ed4a46b4b57))


### Performance Improvements

* **repair-test:** read each source file once, not once per assertion ([428d155](https://github.com/theagenticguy/symspec/commit/428d15592e71527fcf01f6888861bc87faabff1a))

## [1.0.1](https://github.com/theagenticguy/symspec/compare/v1.0.0...v1.0.1) (2026-08-12)


### Bug Fixes

* **scope:** the honest-scope corpus now covers reachability, and reaches the manifest ([#8](https://github.com/theagenticguy/symspec/issues/8)) ([180ef60](https://github.com/theagenticguy/symspec/commit/180ef609146f3d8c5446bd6c0a414c655976c591))

## [1.0.0](https://github.com/theagenticguy/symspec/compare/v1.0.0-alpha.0...v1.0.0) (2026-08-12)


### ⚠ BREAKING CHANGES

* one package at the root, published via release-please + OIDC ([#3](https://github.com/theagenticguy/symspec/issues/3))

### Features

* all the things ([df0efdc](https://github.com/theagenticguy/symspec/commit/df0efdc4a6fcde8c1ca4c7cb271e0bb9d98d889c))
* blah ([a49f651](https://github.com/theagenticguy/symspec/commit/a49f6515a1856dc6311aba72f877ad44e3dfe70f))
* **cli:** add download-model command to pre-warm the semantic model cache ([1c3d3d4](https://github.com/theagenticguy/symspec/commit/1c3d3d452612c2f9c588e14eba8d69928709d5e3))
* **cli:** field-report wishlist (10 items) + `install` skill command ([1b1fb5e](https://github.com/theagenticguy/symspec/commit/1b1fb5e222fda4aa2d871c2fb1d3e40017505878))
* **embed:** replace transformers.js with pure onnxruntime-web WASM ([3c3bac4](https://github.com/theagenticguy/symspec/commit/3c3bac4b588c767adb0c7b0575134075865c9969))
* **formal:** close issue [#2](https://github.com/theagenticguy/symspec/issues/2) — verified never outruns the numeric tier; loud coverage ([fabc156](https://github.com/theagenticguy/symspec/commit/fabc1564833386f3c4831137152eee06fd32a448))
* **formal:** close the 25/30 red-team escapes — lexicon hardening, coverage-demoted verified, embeddings core ([ef40962](https://github.com/theagenticguy/symspec/commit/ef40962126798361cbf3cf61cc9524a932d5071b))
* **formal:** close the atom-matching gap — antonyms, guard-implication closure, coverage gating ([08cdc5b](https://github.com/theagenticguy/symspec/commit/08cdc5b43bece4a2966f147a9789c85c13bfe6b7))
* **formal:** close the atom-matching gap — antonyms, guard-implication closure, coverage gating ([bfeed93](https://github.com/theagenticguy/symspec/commit/bfeed934fde7441f648831524a01a15d6a6ec15a))
* **install:** bundle with tsdown + migrate to registerTool API ([baeaef1](https://github.com/theagenticguy/symspec/commit/baeaef1eda193e7f70e03f67a1ffd2ef7416a1f1))
* **install:** rename bins to symspec/symspec-mcp + ship installable tarball ([0db2f2e](https://github.com/theagenticguy/symspec/commit/0db2f2e6cdea281f157c024fd8ee97ab952cfe93))
* one package at the root, published via release-please + OIDC ([#3](https://github.com/theagenticguy/symspec/issues/3)) ([13242d9](https://github.com/theagenticguy/symspec/commit/13242d999e0787d7e04f4eecb356d95254022fbd))
* **v3.0:** deterministic numeric/arithmetic conflict tier (LIA/LRA) ([654dddb](https://github.com/theagenticguy/symspec/commit/654dddbcbec78dc144f0b53580474ebc325750bc))
* **v3.1,v3.2:** ambiguity finding family + deterministic embedding graph/DAG ([3d8ab3d](https://github.com/theagenticguy/symspec/commit/3d8ab3dd5c9467c199148277f3198ff6c81549e4))
* **v3.3:** bounded LTL→SMT temporal contradiction tier (in-process) ([e714dc5](https://github.com/theagenticguy/symspec/commit/e714dc557ff02bca901a65318d53adaef6066f85))
* **v3.4:** generative-adversarial detection harness + extractor hardening ([41899e1](https://github.com/theagenticguy/symspec/commit/41899e179951c7987fba18335e24a35e525772c9))
* **v5-agents:** AGENTS.md as a kernel projection, with a drift gate that checks BOTH halves ([0a29f28](https://github.com/theagenticguy/symspec/commit/0a29f2857501dfe7d33e49904c6b611c0692d21b))
* **v5-budget:** data.budgetHint, anchored on the run's OWN clock because a cost table did not survive measurement ([75198c8](https://github.com/theagenticguy/symspec/commit/75198c8dbab25c1db2591c398e2fa72baeef4e49))
* **v5-check:** the check op — donor pipeline through the Layer, +repair/+progress, exit contract wired ([4f9f9f8](https://github.com/theagenticguy/symspec/commit/4f9f9f855e34589a3198fb0e2767ef704a844bc7))
* **v5-core:** doc store as Layers — atomic write, donor path precedence, disjoint load codes ([58d242f](https://github.com/theagenticguy/symspec/commit/58d242f44c618ea3669067a8500dc0936908f4e6))
* **v5-core:** document format v3 — stateModel + responseKind first-class, V27 unrepresentable ([9d0cce9](https://github.com/theagenticguy/symspec/commit/9d0cce961c86a8bf1df8a01640169f36776a0eb9))
* **v5-core:** ONE op vocabulary and ONE mutation fold — repair.ops can now be real ([e41d1ba](https://github.com/theagenticguy/symspec/commit/e41d1ba445e497c16d2a2f734c90da55f761f6d8))
* **v5-craft:** the authoring-craft corpus, with every claim measured against the live detectors ([2ef4b47](https://github.com/theagenticguy/symspec/commit/2ef4b473a38a1a96ecca5e4a8755418373dcff8e))
* **v5-craft:** the craft corpus learns the state model, with a transcript that was RUN not composed ([c881853](https://github.com/theagenticguy/symspec/commit/c88185353e8554fd6e19d35501e53761077452a2))
* **v5-formal:** transplant the formal tier + SolverService Layer — 4 files edited, 35 byte-identical ([8059a68](https://github.com/theagenticguy/symspec/commit/8059a68f9e6d58a67d8ed9b1b84f548dd2ff948c))
* **v5-install:** the install op, with all three V11 defects fixed and each fix independently falsifiable ([801c8a5](https://github.com/theagenticguy/symspec/commit/801c8a588302c8f318096c0af297db79b6b30a5e))
* **v5-kernel:** --pretty/--dense/--field as envelope post-processors, exit code untouchable ([58741d6](https://github.com/theagenticguy/symspec/commit/58741d6ea155ec447443a54e676f85142d667e0e))
* **v5-kernel:** envelope + exit contract, ported as agent API not legacy ([394f2da](https://github.com/theagenticguy/symspec/commit/394f2dacc9ba1bf7289f1e8441a78a5645d3073e))
* **v5-kernel:** ERR_* catalog as 21 TaggedErrorClasses, tag IS the code ([c65f6ef](https://github.com/theagenticguy/symspec/commit/c65f6efdb833f856d24abc95ca7953b7dc395fb8))
* **v5-kernel:** ops table + CLI/manifest/help projections, three ops end-to-end ([a4c076f](https://github.com/theagenticguy/symspec/commit/a4c076fc783f576893f669b6be10035ebe6c6986))
* **v5-lint:** transplant the GTWR catalog, publish all 75 codes, and close the oracle's SECOND blind spot ([83d32b1](https://github.com/theagenticguy/symspec/commit/83d32b116b25d3628eb6edcab5eb874e06159081))
* **v5-ops:** init/import/list/show — both hex-bonk docs round-trip exactly ([aad6e5d](https://github.com/theagenticguy/symspec/commit/aad6e5d10f6fadf1c0c26e7a091e85876e2fe82d))
* **v5-ops:** the twelve mutation ops, all folding ONE vocabulary through ONE fold ([6202eb8](https://github.com/theagenticguy/symspec/commit/6202eb875c120565f9e146d68d2d8bb01438ed29))
* **v5-parse:** transplant the parse ladder + the `parse` op — ONE proposedOps name, and a DONOR BUG fixed ([ae23bc3](https://github.com/theagenticguy/symspec/commit/ae23bc3cfe897631ae6d0fd0b66a3aace82c5fa4))
* **v5-reach:** `--reachability-timeout-ms`, and the bound is the CANCELLABILITY mechanism ([03763d3](https://github.com/theagenticguy/symspec/commit/03763d31afad631d43ca5db4c2bc86eda0c88624))
* **v5-reach:** the reachability TIER in `check`, and the worked fixture found a soundness bug ([f40391a](https://github.com/theagenticguy/symspec/commit/f40391a063def4b8b9a00dfbf166be4fd53886d6))
* **v5-reach:** the Spacer Horn encoder, with polarity pinned and three real bugs found by measuring ([6fc7d57](https://github.com/theagenticguy/symspec/commit/6fc7d5709e54e931fbd85293047566e580b71d78))
* **v5-reach:** the vacuous-initial gate — an unsatisfiable Init makes every proof worthless, and the certificate check provably cannot see it ([8c23e26](https://github.com/theagenticguy/symspec/commit/8c23e26c90a94b8886664e144dd82134f8f1e062))
* **v5-repair:** repair.ops become REAL, and the round trip PROVES AC-A-1 + AC-A-2 ([4e09200](https://github.com/theagenticguy/symspec/commit/4e09200321089b5e4cd10c825dfcd04facecef14))
* **v5-semantic:** the EmbedderService Layer — propose-only, fail-closed, and both oracle sides run it ([27f93e2](https://github.com/theagenticguy/symspec/commit/27f93e2630be05ef89031e1230ab31f685be4db4))
* **v5-state:** the state model becomes authorable, with the V14/V21 hazard closed at the FRONT DOOR ([6d3f062](https://github.com/theagenticguy/symspec/commit/6d3f062d340aa7d08fa646f983393a2e84a653a8))
* **wave1:** close seven verified honesty defects ([169af27](https://github.com/theagenticguy/symspec/commit/169af27690a0fb5484ffd0d0b25debf84d09db2b))
* **wave2:** close V6 temporal unsoundness, land reproduce-ops, z3 5.0.0 ([22e0a04](https://github.com/theagenticguy/symspec/commit/22e0a043062100a9fbdbefc4d8cb945d17851d59))
* **wave2:** unify the atomizer (AC-2-7), wire the gates that gated nothing (AC-2-8a) ([4b11b8e](https://github.com/theagenticguy/symspec/commit/4b11b8ed90ca1d3463d7e24c84736669b88fe690))


### Bug Fixes

* **ci:** decide the three undecided allowBuilds — a placeholder string is not a decision ([6eaaa32](https://github.com/theagenticguy/symspec/commit/6eaaa32a944d1c67a8f43385d21189f9dbbd02a8))
* **ci:** let packageManager own the pnpm version — action-setup@v4 errors on a double pin ([03fc3e2](https://github.com/theagenticguy/symspec/commit/03fc3e2e5af14e1944f36f6eb21fdc10c06f8b7e))
* **install:** Claude Code reads .claude/skills, not .agents/skills ([fdd1f47](https://github.com/theagenticguy/symspec/commit/fdd1f47dc91d1e1c50b4d43ee75fe8eb1a4f09be))
* **v5-budget:** the hint divided by pairs IDENTIFIED, not solved — a real under-estimate the loaded suite caught ([0a5a184](https://github.com/theagenticguy/symspec/commit/0a5a1845d27556f298b740c17205568bcfdca91b))
* **v5-explain:** the code COUNT becomes a projection too — two surfaces still said 75 after G4 made it 80 ([9d2b83f](https://github.com/theagenticguy/symspec/commit/9d2b83ffdb70c42b982f935a9665b37faf708afb))
