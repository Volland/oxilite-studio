## 1. Server

- [x] 1.1 `oxilite/attach` and `oxilite/attachD1` accept `activate` (default true); test

## 2. Extension

- [x] 2.1 `shared/pin.ts`: parse pins per language; connection references to and from attach
      requests and connection ids; unit tests
- [x] 2.2 Pinned query files: run and explain on the pinned connection, attaching it without
      activating; CodeLens with the target
- [x] 2.3 Notebook kernel per connection, kept in step with the connections list
- [x] 2.4 Kernel selection saved in notebook metadata; reopening re-attaches it and selects its kernel
- [x] 2.5 Outputs record and show their connection

## 3. Docs and release

- [x] 3.1 `lat.md`: fix the "can pin" claim, document pins and notebook kernels; `lat check`
- [x] 3.2 Demo notebook records its connection; README
- [x] 3.3 Version 0.1.2, packages, publish
