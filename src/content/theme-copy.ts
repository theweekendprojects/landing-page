/**
 * Per-theme hero + about copy, ported verbatim from each theme's source
 * mockup in design-demos/. Features and Newsletter are kept as permanent
 * site sections across every theme (the mockups don't all have them, but
 * they're real product features here, not just visual decoration), so
 * only the copy that's genuinely theme-specific lives here.
 */
import { ACTIVE_THEME } from "../styles/active-theme";

export interface ThemeCopy {
	hero: {
		eyebrow?: string;
		title: string;
		subtitle: string;
		primaryCta: { label: string; href: string };
		secondaryCta?: { label: string; href: string };
	};
	about: {
		title: string;
		paragraphs: string[];
	};
}

// The three "variation-N" mockups share identical About copy ("Why This
// Exists") and only differ in hero title. Defined once, reused below.
const WHY_THIS_EXISTS: ThemeCopy["about"] = {
	title: "Why This Exists",
	paragraphs: [
		"We believe that creativity shouldn't be limited to business hours. The Weekend Projects is a community for developers and tech professionals who use their free time to explore, experiment, and contribute. It's about building what you're passionate about, not just what your job requires.",
	],
};

const THEME_COPY: Record<string, ThemeCopy> = {
	"variation-1": {
		hero: {
			title: "Creative Coding Beyond the 9-5",
			subtitle:
				"For IT professionals who spend their weekdays doing routine work but use weekends to unleash creativity through side projects, open source contributions, and tech experiments.",
			primaryCta: { label: "Explore Projects", href: "/projects" },
			secondaryCta: { label: "Read Tutorials", href: "/posts" },
		},
		about: WHY_THIS_EXISTS,
	},
	"variation-2": {
		hero: {
			title: "Creative Coding Beyond the 9-5",
			subtitle:
				"For IT professionals who spend their weekdays doing routine work but use weekends to unleash creativity through side projects, open source contributions, and tech experiments.",
			primaryCta: { label: "Explore Projects", href: "/projects" },
			secondaryCta: { label: "Read Tutorials", href: "/posts" },
		},
		about: WHY_THIS_EXISTS,
	},
	"variation-3": {
		hero: {
			title: "Creative Coding Beyond the 9-5",
			subtitle:
				"For IT professionals who spend their weekdays doing routine work but use weekends to unleash creativity through side projects, open source contributions, and tech experiments.",
			primaryCta: { label: "Explore Projects", href: "/projects" },
			secondaryCta: { label: "Read Tutorials", href: "/posts" },
		},
		about: WHY_THIS_EXISTS,
	},
	"huashu-variation-1": {
		hero: {
			title: "Code on Your Terms. Build Your Passion.",
			subtitle:
				"The Weekend Projects is your community for weekend hackers, side-project builders, and creative developers who code not just for work, but for joy.",
			primaryCta: { label: "Start Building", href: "/projects" },
			secondaryCta: { label: "Learn More", href: "/pages/about" },
		},
		about: {
			title: "Created for Developers Who Love to Create",
			paragraphs: [
				"The Weekend Projects was born from a simple realization: coding shouldn't just be about work. Many of us spend our weekdays solving corporate problems, but our creative spark burns brightest on our personal projects.",
				"We've created a community where weekend hackers can share their journey, learn from each other, and find inspiration for their next big idea. Whether you're building a simple script or a full application, your weekend projects matter.",
			],
		},
	},
	"huashu-variation-2": {
		hero: {
			eyebrow: undefined,
			title: "Build Creative Freedom into Your Weekend",
			subtitle:
				"A playground for developers who spend weekdays coding corporate apps but use weekends to unleash creativity, contribute to open source, and build projects that matter.",
			primaryCta: { label: "Explore Projects", href: "/projects" },
			secondaryCta: { label: "Read Tutorials", href: "/posts" },
		},
		about: {
			title: "More Than Just a Platform — A Creative Movement",
			paragraphs: [
				"At The Weekend Projects, we believe that the best innovations happen outside the constraints of daily work. This is where developers transform their wildest ideas into reality.",
				"Whether you're contributing to open source, building side projects, or experimenting with new technologies, you're part of a community that values creativity, learning, and growth.",
			],
		},
	},
	"huashu-variation-3": {
		hero: {
			eyebrow: "Creative Freedom for Developers",
			title: "Build Something Every Weekend",
			subtitle:
				"A curated collection of weekend projects, tutorials, and creative coding experiments. Turn your side ideas into reality.",
			primaryCta: { label: "Start Exploring", href: "/projects" },
			secondaryCta: { label: "Read Tutorials", href: "/posts" },
		},
		about: {
			// huashu-variation-3's source mockup has no About section (it
			// goes straight from Blog to Newsletter) -- reusing the
			// closest sibling's tone rather than inventing new copy.
			title: "Why This Exists",
			paragraphs: WHY_THIS_EXISTS.paragraphs,
		},
	},
};

export function getThemeCopy(): ThemeCopy {
	return THEME_COPY[ACTIVE_THEME] ?? THEME_COPY["variation-1"];
}
