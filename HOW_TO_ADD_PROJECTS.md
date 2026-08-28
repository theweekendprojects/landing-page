# How to Add Projects to This EmDash Site

## Current State

- Site uses EmDash with blog-cloudflare template
- Has posts collection for blogs
- Needs projects collection for portfolio

## Step 1: Add Projects Collection to seed.json

Add this collection to the `collections` array in `seed/seed.json`:

```json
{
  "slug": "projects",
  "label": "Projects",
  "labelSingular": "Project",
  "supports": ["drafts", "revisions", "search", "seo"],
  "fields": [
    {
      "slug": "title",
      "label": "Title",
      "type": "string",
      "required": true,
      "searchable": true
    },
    {
      "slug": "slug",
      "label": "Slug",
      "type": "string",
      "required": true
    },
    {
      "slug": "featured_image",
      "label": "Featured Image",
      "type": "image"
    },
    {
      "slug": "description",
      "label": "Short Description",
      "type": "text"
    },
    {
      "slug": "full_content",
      "label": "Full Content",
      "type": "portableText"
    },
    {
      "slug": "tech_stack",
      "label": "Tech Stack",
      "type": "array",
      "items": { "type": "string" }
    },
    {
      "slug": "github_url",
      "label": "GitHub URL",
      "type": "string"
    },
    {
      "slug": "live_url",
      "label": "Live Demo URL",
      "type": "string"
    },
    {
      "slug": "category",
      "label": "Category",
      "type": "string",
      "options": [
        { "value": "web", "label": "Web Application" },
        { "value": "mobile", "label": "Mobile App" },
        { "value": "cli", "label": "CLI Tool" },
        { "value": "library", "label": "Library/Package" },
        { "value": "api", "label": "API/Backend" },
        { "value": "design", "label": "Design/UX" },
        { "value": "other", "label": "Other" }
      ]
    },
    {
      "slug": "featured",
      "label": "Featured",
      "type": "boolean"
    },
    {
      "slug": "published_at",
      "label": "Published Date",
      "type": "datetime"
    }
  ]
}
```

## Step 2: Update seed.json to Include Projects Content

Add to the `content` object in `seed.json`:

```json
{
  "content": {
    "pages": [...],
    "posts": [...],
    "projects": [
      {
        "id": "project-1",
        "slug": "project-name",
        "status": "published",
        "data": {
          "title": "Project Title",
          "description": "Short description...",
          "tech_stack": ["React", "Node.js"],
          "github_url": "https://github.com/user/project",
          "live_url": "https://example.com",
          "category": "web",
          "featured": true,
          "published_at": "2024-01-01T00:00:00Z",
          "full_content": [...]
        }
      }
    ]
  }
}
```

## Step 3: Create Projects Page Route

Create `src/pages/projects/index.astro` to list all projects.

## Step 4: Update Home Page

Modify `src/pages/index.astro` to show both posts and projects.

## Current Theme

The theme is in `src/styles/theme.css` with orange/purple gradients.
