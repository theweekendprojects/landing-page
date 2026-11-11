// EmVB editor bundle wrapper: importing the daisyUI provider here registers its component + recipe
// singleton in the browser editor so its elements show in the Add panel. Re-export EmVB's real
// admin so the plugin's pages/fields still load. Wired via emvb({ adminEntry, providers }).
import "@perkyzz/emvb-daisyui";

export * from "@perkyzz/emvb/admin";
