// EmVB editor bundle wrapper: registers the daisyUI extension in the browser editor, then re-exports
// EmVB's real admin so the plugin's pages and fields still load. Wired via emvb({ adminEntry }).
// The canvas is drawn in the browser, so the extension's render functions must be registered here
// too. The server registers them from astro.config (emvb({ extensions })) for the public site.
import { rememberExtensions } from "@perkyzz/emvb/core";
import { daisyExtension as daisyUIExtension } from "emvb-ext-daisy";
rememberExtensions([daisyUIExtension]);
export * from "@perkyzz/emvb/admin";
