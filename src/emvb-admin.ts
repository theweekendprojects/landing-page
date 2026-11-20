// EmVB editor bundle wrapper: importing the daisyUI provider here registers its component + recipe
// singleton in the browser editor so its elements show in the Add panel. Re-export EmVB's real
// admin so the plugin's pages/fields still load. Wired via emvb({ adminEntry, providers }).
import "@perkyzz/emvb-daisyui";
// The canvas is drawn in the browser, so the extension's render functions must be registered here
// too. The server registers them from astro.config (emvb({ extensions })) for the public site.
import { rememberExtensions } from "@perkyzz/emvb/core";
import { daisyUIExtension } from "@perkyzz/emvb-daisyui/extension";
rememberExtensions([daisyUIExtension]);
export * from "@perkyzz/emvb/admin";
