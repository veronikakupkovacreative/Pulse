# PULSE / Essentia.js commercial release decision

Status: EXPERIMENTAL ONLY — not cleared for a closed-source PULSE production deployment.

This is a technical licensing review, not legal advice or a grant of rights. Source version: essentia.js 0.1.3 (npm license AGPL-3.0), Essentia/MTG licensing documentation.

Official sources:
- https://github.com/MTG/essentia.js — AGPL-3.0 repository
- https://essentia.upf.edu/licensing_information.html — commercial licensing and dependencies
- https://www.gnu.org/licenses/agpl-3.0.en.html — AGPL v3 terms, including network interaction

## Distributed components

The experimental PULSE build ships the Essentia WebAssembly binary, JavaScript loader, UMD core, the PULSE worker bridge, and upstream LICENSE.txt from the installed npm package.

This is browser-side redistribution, not merely a private server-side dependency. Bundling a license text is not itself proof that all source-availability and combined-work obligations have been met.

## Recommended choices

A. An open-source AGPL-compliant product: obtain legal review of the scope of the combined work, which source files must be published, required build/install information, attribution, license notices and remote network-user source offer where applicable. UPF explicitly notes that some linked third-party dependencies have separate rights.

B. A closed-source commercial PULSE: obtain an appropriate commercial license from MTG / Universitat Pompeu Fabra, explicitly including the essentia.js WebAssembly distribution and necessary algorithms. Confirm separate dependencies and permitted production scale.

C. Alternative signal-processing stack: replace Essentia with appropriately licensed libraries or an independent implementation, then rerun the accuracy benchmark and browser smoke test.

AGPL-3.0 does not generally prohibit commercial use, but it carries copyleft and source obligations. Whether particular PULSE components constitute a combined work is a question for legal review. Production clearance is NOT achieved by this experiment.

## Browser QA gate

The browser diagnostic page /essentia-browser-qa.html tests actual same-origin Essentia Web Worker + WASM against synthetic 70, 140, 80 and 160 BPM fixtures plus C-major/Camelot 8B/chord analysis, showing a copyable pass/fail JSON report.

The page does not establish license compliance or accuracy on real mastered songs.

Release checklist:
- [ ] Real Chromium Web Worker / WASM test passes
- [ ] Safari desktop/mobile testing where supported
- [ ] Real reference songs with half/double tempo and chord changes reviewed
- [ ] Commercial license or documented AGPL compliance reviewed
- [ ] Third-party dependencies and possible model licenses reviewed
- [ ] Corresponding source availability and required notices verified
- [ ] Only then merge to production
