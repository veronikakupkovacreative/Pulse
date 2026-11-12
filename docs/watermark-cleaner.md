# PULSE / Watermark Cleaner

A local-first metadata inspector for **user-owned audio** (WAV, MP3, FLAC)
and a conservative invisible-Unicode text cleaner.

## Scope

- WAV: strip selected non-audio RIFF chunks (LIST/INFO, BEXT, iXML, XMP,
  ID3, C2PA/JUMF), copying audio and format chunks exactly.
- MP3: strip ID3v2 at the beginning and ID3v1 at the end; preserve encoded MP3
  frame bytes. Other metadata families such as APEv2 are not covered.
- FLAC: strip Vorbis comments, APPLICATION and PICTURE blocks while retaining
  STREAMINFO, seek tables, and compressed audio frames.
- Text: remove specified zero-width, bidi and tag carriers; preserve ZWJ/ZWNJ,
  which can have important uses in language and emoji.
- Files are read and processed entirely in the browser; no API keys, uploads,
  or audio re-encoding. The original is not changed.

## Explicit limitations

This is **not** a detector/remover for acoustic or model-embedded audio
watermarks (AudioSeal, WavMark, SilentCipher etc.). It does not remove
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
