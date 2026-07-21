# Security notes

Codex Native 2007 does not patch or replace files inside the Codex application
bundle. Its launcher starts Codex with Chromium's remote-debugging interface
bound to `127.0.0.1`, then injects the local theme into verified `app://` pages.

The injector rejects non-loopback debugger URLs, validates target IDs against
their WebSocket paths, and anchors itself to the browser identity created by the
launcher. Closing that Codex instance also ends the watcher.

Only install copies you trust. A skin injected through a debugging interface
runs with access to the rendered Codex page. To report a security problem,
please open a GitHub security advisory instead of a public issue.
