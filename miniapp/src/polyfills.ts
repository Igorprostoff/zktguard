/**
 * Browser polyfills required for @ton/core and @tonconnect/ui-react.
 *
 * Imported FIRST in `main.tsx` so the global is set before any other
 * import side-effect runs. Module init order in ES modules is a
 * post-order DFS of the import graph, so this side-effect-only
 * module (no own imports beyond `buffer`) executes before
 * `@tonconnect/ui-react` evaluates.
 */
import { Buffer } from "buffer";

(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
