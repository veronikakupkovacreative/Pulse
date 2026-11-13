# PULSE / Watermark Cleaner

A local-first metadata inspector for **user-owned audio** (WAV, MP3, FLAC, M4A)
and a conservative invisible-Unicode text cleaner.

## Scope

- WAV: strip selected non-audio RIFF chunks (LIST/INFO, BEXT, iXML, XMP,
  ID3, C2PA/JUMF), copying audio and format chunks exactly.
- MP3: strip ID3v2 at the beginning and ID3v1 at the end; preserve encoded MP3
  frame bytes. Other metadata families such as APEv2 are not covered.
- FLAC: strip Vorbis comments, APPLICATION and PICTURE blocks while retaining
  STREAMINFO, seek tables, and compressed audio frames.
- M4A: find and neutralize supported iTunes `ilst` metadata and `keys` atoms
  and selected user-data metadata atoms by replacing them with equal-size
  `free` atoms. This leaves `mdat` encoded audio bytes, atom sizes, and absolute
  track sample offsets unchanged (including fast-start files). No media is
  decoded or transcoded. Arbitrary UUID/C2PA content is not covered.
- Text: remove specified zero-width, bidi and tag carriers; preserve ZWJ/ZWNJ,
  which can have important uses in language and emoji. Optional, opt-in
  controls normalize smart typography, uncommon spaces, Latin-mixed Cyrillic/
  Greek lookalikes, and Unicode NFKC compatibility characters.
- Files are read and processed entirely in the browser; no API keys, uploads,
  or audio re-encoding. The original is not changed.

## Explicit limitations

This is **not** a detector/remover for acoustic or model-embedded audio
watermarks (AudioSeal, WavMark, SilentCipher, SynthID etc.). It does not remove
statistical token-sampling marks from text, and it does not process
PDF/video/image provenance or full C2PA manifests in every format. Metadata
removal does not verify removal of embedded provenance. It may strip
copyright/attribution fields; the user must have permission to modify them.

The original GitHub repository
[guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover)
is MIT-licensed (Copyright 2026 Guillaume Meyer and contributors). Its
documented audio "purify" chain is intentionally destructive (tempo,
pitch, EQ and low-bitrate re-encode) and is NOT imported into PULSE.
The browser module is an independent implementation of the metadata-only
approach for lossless, consent-based use.


## Provenance and licensing

Extended browser support is informed by
[watermark-remover-plus](https://github.com/CSGonzalez22/watermark-remover-plus)
(MIT, Copyright 2026 CSGonzalez22). The Python project uses the optional
`mutagen` package for M4A/OGG; PULSE instead implements a standalone, local
M4A/ISO BMFF metadata-only routine, without importing Python or a server worker.

Not yet supported: OGG/Vorbis/Opus, arbitrary MP4/video, JPEG/PNG,
documents/PDF, all C2PA provenance manifest placements, APEv2 MP3 metadata,
embedded acoustic AI markers or statistical text sampling watermarks.
Metadata fields can contain attribution and license information: preserve
originals and respect any applicable disclosure obligations.
