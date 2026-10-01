/**
 * Resolve an above-the-fold hero image once, for BOTH the <img> and a matching
 * LCP preload link.
 *
 * Why: emdash's <Image priority> sets loading="eager" + fetchpriority="high" but,
 * in this Astro version, does NOT emit a <link rel="preload" as="image"> for the
 * hero (verified in live HTML — fonts preload, the hero image doesn't). The
 * preload starts the LCP fetch during HTML parse instead of after the parser
 * reaches the <img>; it's the documented remaining LCP win (see
 * .agents/skills/cloudflare-performance §3).
 *
 * The hazard with a hand-written preload is a URL that doesn't match the variant
 * the browser picks from srcset -> double download. We avoid it by resolving the
 * image through Astro's own getImage() (the same astro:assets service <Image>
 * uses) ONCE and feeding that single result to both the <img> attrs and the
 * preload. src/srcset/sizes are then identical by construction.
 *
 * Usage (in a page's frontmatter):
 *   const hero = await resolveHero({ image: post.data.featured_image, origin: Astro.url.origin });
 *   // <Base heroPreload={hero?.preload}> ... <img {...hero.imgAttrs} alt={...} />
 *
 * ponytail: hero only. Below-the-fold images stay on <Image> (lazy + blur). This
 * returns null when there's no usable image, so callers render their existing
 * placeholder branch unchanged.
 */
import { getImage } from "astro:assets";
import type { MediaValue } from "emdash";

export interface HeroPreload {
	href: string;
	imagesrcset?: string;
	imagesizes?: string;
}

export interface ResolvedHero {
	imgAttrs: Record<string, unknown>;
	preload: HeroPreload;
}

function absolutize(u: string, origin: string): string {
	return u.startsWith("http") ? u : `${origin}${u}`;
}

/** emdash media object (or string) -> absolute URL the image service can fetch. */
function resolveMediaUrl(
	img: MediaValue | string | undefined,
	origin: string,
): string | undefined {
	if (!img) return undefined;
	if (typeof img === "string") return absolutize(img, origin);
	if (typeof img !== "object") return undefined;
	const rec = img as Record<string, unknown>;
	if (typeof rec.src === "string" && rec.src) return absolutize(rec.src, origin);
	const meta = rec.meta as Record<string, unknown> | undefined;
	const storageKey =
		(typeof meta?.storageKey === "string" ? meta.storageKey : undefined) ||
		(typeof rec.id === "string" ? rec.id : undefined);
	if (storageKey) return absolutize(`/_emdash/api/media/file/${storageKey}`, origin);
	return undefined;
}

/** Pull cached dimensions off a MediaValue (emdash stores them for display). */
function dimensionsOf(
	img: MediaValue | string | undefined,
): { width?: number; height?: number } {
	if (!img || typeof img !== "object") return {};
	const rec = img as Record<string, unknown>;
	const width = typeof rec.width === "number" ? rec.width : undefined;
	const height = typeof rec.height === "number" ? rec.height : undefined;
	return { width, height };
}

export async function resolveHero(args: {
	image: MediaValue | string | undefined;
	origin: string;
	/** Responsive layout; hero spans the content column, so full-width by default. */
	layout?: "full-width" | "constrained";
	sizes?: string;
}): Promise<ResolvedHero | null> {
	const url = resolveMediaUrl(args.image, args.origin);
	if (!url) return null;

	// Use the dimensions emdash already cached on the MediaValue. This is what
	// <Image> itself does — it avoids an inferSize round trip, which fails during
	// SSR at the edge (the Worker fetching its own origin isn't reliable/allowed)
	// and was silently sending us down the null fallback path.
	const { width, height } = dimensionsOf(args.image);
	if (!width || !height) return null; // no dimensions -> let <Image> handle it

	let picture: Awaited<ReturnType<typeof getImage>>;
	try {
		picture = await getImage({
			src: url,
			width,
			height,
			layout: args.layout ?? "full-width",
			...(args.sizes ? { sizes: args.sizes } : {}),
		});
	} catch {
		// Any image-service error — fall back to the normal <Image> path rather
		// than break the page.
		return null;
	}

	const imagesizes =
		typeof picture.attributes?.sizes === "string"
			? picture.attributes.sizes
			: args.sizes;

	return {
		imgAttrs: {
			src: picture.src,
			srcset: picture.srcSet?.attribute,
			...picture.attributes,
			loading: "eager",
			decoding: "async",
			fetchpriority: "high",
		},
		preload: {
			href: picture.src,
			imagesrcset: picture.srcSet?.attribute || undefined,
			imagesizes: imagesizes || undefined,
		},
	};
}
