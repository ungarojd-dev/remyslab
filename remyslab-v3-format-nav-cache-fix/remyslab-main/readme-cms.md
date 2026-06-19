# Remy's Lab CMS publishing setup

This site uses Decap CMS, Netlify Identity, Git Gateway, and a small dependency-free Node script.

## Publishing a Lab Note

1. Go to https://remyslab.com/admin/ and log in.
2. Open **Lab Notes**.
3. Select **New Lab Note**.
4. Complete the fields.
5. Select **Publish**.
6. Decap CMS commits the JSON entry to GitHub.
7. Netlify runs `node scripts/build-content.js` and deploys the updated static site.

The note automatically appears on `/blog/`, gets its own HTML page, and is added to `sitemap.xml` and `llms.txt` in the deployed site.

## Publishing a Dog Owner Guide

1. Go to https://remyslab.com/admin/ and log in.
2. Open **Dog Owner Guides**.
3. Select **New Dog Owner Guide**.
4. Complete the fields.
5. Add related Lab Notes only when a tested product is relevant.
6. Select **Publish**.

The guide automatically appears on `/guides/`, gets its own HTML page, and is added to `sitemap.xml` and `llms.txt` in the deployed site.

## Build details

- Build command: `node scripts/build-content.js`
- Publish directory: `.`
- No npm packages are required.
- No paid CMS is required.
- Generated HTML is static and mobile-first.

## Old folder cleanup

The old `_posts/` folder is no longer used by the CMS. It can be deleted after the updated files are committed.
