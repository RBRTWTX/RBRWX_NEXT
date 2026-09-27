# RBRWX NEXT transactional phase installer framework

## Purpose

CP1B installs one repository-owned framework for future RBRWX NEXT phase packages. Future installers must import `scripts/install/framework.mjs` from the exact accepted Git base instead of reimplementing repository staging, manifest hashing, build gates, promotion, or rollback.

The framework is repository infrastructure. It does not define weather products, map rendering, broadcast graphics, or operator UI.

## Required phase model

A future phase package contains:

- a small installer based on `scripts/install/phase-installer-template.mjs`;
- a signed descriptor (`PHASE_PACKAGE.json` in the template);
- a `payload/` directory containing only the files the phase intends to add or replace.

The descriptor locks the phase to one full 40-character accepted-base commit SHA. The target working tree must be at that exact commit and completely clean before installation starts.

Repository integrity manifests are **not payload files**. The framework migrates them in staging from the accepted repository using `scripts/repo/integrity.mjs`. This prevents packaged manifests from becoming stale and prevents LF/CRLF checkout differences from changing canonical text integrity.

## Installation lifecycle

`runPhaseInstaller()` performs this sequence:

1. Verify the phase descriptor and every declared payload file by raw SHA-256.
2. Verify exact Git HEAD, clean working tree, Node 22-24, and current repository canonical integrity.
3. Copy tracked files from the clean target working tree into a non-Git staging directory. It does not materialize alternate Git-blob bytes.
4. Copy only descriptor-declared payload files. Undeclared/stale files in the package directory are ignored.
5. Apply only descriptor-declared file deletions.
6. Update integrity ownership in staging:
   - existing payload files keep their existing single owner;
   - new files require explicit `newOwnership`;
   - deleted owned files are removed from their owner manifest;
   - touched manifests are rehashed with canonical text hashing / raw binary hashing.
7. Run the real repository integrity verifier before dependency installation.
8. Snapshot the candidate source boundary.
9. Run the standard deterministic gates:
   - `npm ci --no-audit --no-fund`
   - `npm run verify`
   - `cargo check --locked --manifest-path src-tauri/Cargo.toml`
   - `npm run tauri -- build --no-bundle`
10. Remove known generated build state, verify the build did not mutate the source boundary, and run repository integrity again.
11. Compute the exact candidate delta and reject any changed/deleted path outside the declared payload, touched manifests, or explicit delete list.
12. Promote the already-validated candidate transactionally.
13. Compare promoted files byte-for-byte with the staged files before accepting promotion.
14. Run repository integrity and framework self-tests inside the rollback boundary.
15. Leave Git HEAD unchanged. The operator reviews/commits the resulting working-tree checkpoint manually.

## Integrity rules

Text integrity uses CP1A canonical hashing: CRLF and LF representations of identical text hash the same after newline normalization. Binary integrity remains raw-byte SHA-256.

Promotion identity is intentionally different: stage-to-target promotion compares **raw bytes**. A file accepted for promotion must arrive in the working tree byte-for-byte identical to the already-tested candidate.

These two rules solve different problems:

- canonical hashes make repository text integrity cross-platform;
- raw promotion hashes prove the installed candidate is exactly the candidate that passed the gates.

## Ownership rules

The current repository uses five single-owner manifests. A normal phase must not move an already-owned file from one manifest to another. Existing files retain their owner automatically. Every new payload file must be assigned in `newOwnership`.

If a future architectural phase truly needs to move ownership between manifests, make that a dedicated reviewed migration rather than hiding the move inside an ordinary feature installer.

## Deterministic versus live provider checks

The default framework runs deterministic repository/build gates only. It does **not** call `npm run verify:live` and does not probe live weather providers during installation.

Live provider validation remains a separate operator action. Temporary external outages must not make a deterministic source checkpoint uninstallable.

## Generated files

The source-boundary verifier ignores and then removes only known generated outputs such as `node_modules/`, `dist/`, `src-tauri/target/`, `src-tauri/gen/`, and root TypeScript `.tsbuildinfo` files. Unexpected generated files outside those boundaries cause installation to fail.

## Failure behavior

No candidate is promoted until all deterministic JavaScript/TypeScript, Rust, and Tauri build gates pass in staging. During promotion, originals are backed up. Any raw-byte mismatch, repository-integrity failure, framework-test failure, or other post-promotion verification error restores the previous working-tree files before the installer exits with failure.

The installer never commits, pushes, or changes Git HEAD. GitHub Desktop remains the manual review/commit step after a successful checkpoint.
