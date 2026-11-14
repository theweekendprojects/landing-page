import type { APIRoute } from "astro";
// Compiled Tailwind + daisyUI, served at a stable URL so the EmVB editor canvas (a sandboxed
// iframe that cannot see the site's bundled CSS) can load it via emvb({ canvasStyles }).
import css from "../../styles/emvb-daisyui.css?inline";

export const GET: APIRoute = () =>
	new Response(css, {
		headers: {
			"content-type": "text/css; charset=utf-8",
			"cache-control": "public, max-age=3600",
		},
	});
