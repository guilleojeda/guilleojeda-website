# Website behavior and maintenance

The site showcases Guille Ojeda’s writing, talks, books, and community work. It is a static Astro site, generated in English at `/` and Spanish at `/es/` from a shared layout and small bilingual content modules.

LinkedIn is the contact destination, including speaking invitations. Simple AWS sponsorship inquiries go to Passionfroot. The site does not offer consulting. Publication titles can retain their original language; navigation, descriptions, metadata, and accessibility text are localized.

Content lives in the repository. A work item stores common identifiers and destinations once, with its English and Spanish descriptions together. Updating a role or adding a talk should not require editing page templates. The site links to every supported publication hub rather than importing individual articles or refreshing feeds at runtime. Featured work cards are a selection, with the remaining writing hubs, white papers, resources, and projects available in a native disclosure. Historical experiments and prototypes carry explicit labels. Featured speaking cards are a selection; the complete year-grouped archive includes supported talks, workshops, hosted events, podcasts, training sessions, and video appearances. Native disclosure keeps that archive usable without JavaScript. Records without a public destination remain readable entries. Hosted events identify the host role explicitly; guest talks are not attributed to Guille. Ongoing organizing roles remain under community activities. Keynote reaction videos are commentary, not conference sessions. White papers identify authorship separately from publisher affiliation. Guille owns the content and both translations.

Historical book credits do not imply current availability. The third book is explicitly in progress; the historical video course is marked no longer available. These statuses are separate from published book credits. The site omits changing audience statistics. Add them only when accurate information is available and the copy describes its date or status correctly. Community Builder and User Group Leader are distinct roles; the latter names AWS AI User Group Argentina.

## Rendering and routing

The complete content and ordinary language links work without JavaScript. English and Spanish are separate HTML documents. Language selection is explicit and returns to the top of the other language’s home page; it is not inferred from browser settings or persisted in cookies.

The public origin comes from the build’s `SITE_URL`, which is `https://guilleojeda.com` in production. Both locales use that value consistently for canonical, alternate-language, and social metadata. It must describe the deployed endpoint.

CloudFront reads a private S3 bucket through Origin Access Control. A small viewer-request function first redirects only the exact `www.guilleojeda.com` host to `https://guilleojeda.com`, retaining the complete URI and raw query string. The apex and CloudFront hostnames continue through the normal routing: `/` serves `index.html`, `/es/` serves `es/index.html`, and `/es` redirects to `/es/` while retaining the query. Assets pass through. Unknown paths return HTTP 404 with links to both home pages rather than a successful homepage response.

The custom certificate covers the apex and `www` names and is DNS validated through the Route 53 hosted zone. The apex A and AAAA records alias the existing CloudFront distribution; `www` uses the same aliases so the function can issue the canonical redirect. Registration remains at GoDaddy. The Route 53 zone preserves the blog, mail, verification, and other non-provider records copied during the launch.

## Delivery and recovery

GitHub Actions builds without AWS deployment privileges and passes the resulting artifact to the main-branch deployment job. That job uses GitHub OIDC and a resource-scoped AWS role. Repository variables contain public identifiers and the deployment URL, not long-lived AWS credentials. The content-deployment role cannot administer infrastructure.

Production publication is serialized. A superseded main-branch push must not replace a newer build. Hashed assets are uploaded before mutable HTML and metadata; old hashed assets are retained so previously cached pages remain usable. An age-only deletion rule could remove a current asset that has not changed, so none is used. This accepts small storage growth in exchange for simple, reliable cached-page and rollback behavior; reconsider cleanup only if measured growth warrants it.

HTML and mutable metadata revalidate; hashed assets can be cached immutably. CloudFront invalidation and direct live checks are part of deployment. Uploading several objects is not atomic: a failure can leave mixed files until the same intended revision is redeployed. A failed build publishes nothing, and a failed deployment is reported as failed rather than hidden by a successful build.

Rollback is a reviewed Git revert on `main`, delivered through the same workflow. AWS configuration is versioned in CloudFormation, with setup and infrastructure changes performed through a separately authorized operator session. Before changing DNS authority, compare the full unrelated-record inventory and reconcile DNSSEC/parent DS state. DNS rollback requires a verified complete zone at the previous provider before restoring its delegation. The Route 53 hosted zone is retained if removed from the stack. Account-wide identity resources are reused when present rather than replaced or deleted as a side effect of this site.

See the README for current editing, build, setup, and recovery commands.

## Content sources

The [creator résumé](https://docs.google.com/document/d/1G_aueykXFIcOXcRmW-gVHbzVcrTv5S5MxxkxjWD-6j0/edit) is the baseline inventory, supplemented by event/recording pages and direct owner confirmations. A résumé-supported historical appearance can be listed without an available recording; an announcement alone does not prove a scheduled appearance happened. Use accurate titles and distinguish repeated sessions at different events. The owner confirmed on September 21, 2026 that the August 2026 Mexico Summit talk was delivered and that *Building Highly Available Applications on AWS* remains in progress.
