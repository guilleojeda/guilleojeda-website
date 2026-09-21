# Website behavior and maintenance

The site showcases Guille Ojeda’s writing, talks, books, and community work. It is a static Astro site, generated in English at `/` and Spanish at `/es/` from a shared layout and small bilingual content modules.

LinkedIn is the contact destination, including speaking invitations. Simple AWS sponsorship inquiries go to Passionfroot. The site does not offer consulting. Publication titles can retain their original language; navigation, descriptions, metadata, and accessibility text are localized.

Content lives in the repository. A work item stores common identifiers and destinations once, with its English and Spanish descriptions together. Updating a role or adding a talk should not require editing page templates. The site links to existing publications rather than importing their articles or refreshing feeds at runtime. Guille owns the content and both translations.

Historical book credits do not imply current availability. The site omits unconfirmed releases and changing audience statistics. Add them only when accurate information is available and the copy describes its date or status correctly.

## Rendering and routing

The complete content and ordinary language links work without JavaScript. English and Spanish are separate HTML documents. Language selection is explicit and returns to the top of the other language’s home page; it is not inferred from browser settings or persisted in cookies.

The public origin comes from the build’s `SITE_URL`. Both locales use that value consistently for canonical, alternate-language, and social metadata. It must describe the deployed endpoint.

CloudFront reads a private S3 bucket through Origin Access Control. A small viewer-request function handles the two page paths: `/` serves `index.html`, `/es/` serves `es/index.html`, and `/es` redirects to `/es/` while retaining the query. Assets pass through. Unknown paths return HTTP 404 with links to both home pages rather than a successful homepage response.

The initial deployment uses CloudFront’s own HTTPS domain. It does not change the existing personal domain, its blog, or email DNS.

## Delivery and recovery

GitHub Actions builds without AWS deployment privileges and passes the resulting artifact to the main-branch deployment job. That job uses GitHub OIDC and a resource-scoped AWS role. Repository variables contain public identifiers and the deployment URL, not long-lived AWS credentials. The content-deployment role cannot administer infrastructure.

Production publication is serialized. A superseded main-branch push must not replace a newer build. Hashed assets are uploaded before mutable HTML and metadata; old hashed assets are retained so previously cached pages remain usable. An age-only deletion rule could remove a current asset that has not changed, so none is used. This accepts small storage growth in exchange for simple, reliable cached-page and rollback behavior; reconsider cleanup only if measured growth warrants it.

HTML and mutable metadata revalidate; hashed assets can be cached immutably. CloudFront invalidation and direct live checks are part of deployment. Uploading several objects is not atomic: a failure can leave mixed files until the same intended revision is redeployed. A failed build publishes nothing, and a failed deployment is reported as failed rather than hidden by a successful build.

Rollback is a reviewed Git revert on `main`, delivered through the same workflow. AWS configuration is versioned in CloudFormation, with setup and infrastructure changes performed through a separately authorized operator session. Account-wide identity resources are reused when present rather than replaced or deleted as a side effect of this site.

See the README for current editing, build, setup, and recovery commands.
