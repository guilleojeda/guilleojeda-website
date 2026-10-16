# Guille Ojeda’s website

A bilingual work showcase built with Astro. English is at `/`, Spanish at `/es/`. The generated site is hosted in private S3 behind CloudFront and published by GitHub Actions.

The production canonical origin is `https://guilleojeda.com`. The apex serves the site, while `https://www.guilleojeda.com` permanently redirects to the same apex path and preserves the raw query string. CloudFront's generated hostname remains usable for infrastructure checks and rollback.

## Local development

Use Node 24 LTS (see `.nvmrc`) and npm.

```sh
npm ci
SITE_URL=https://guilleojeda.com npm run dev
```

Open the local URL printed by Astro. `SITE_URL` controls page metadata; navigation between local pages uses relative links. For a production build, supply the actual public HTTPS origin without a path, query, or fragment.

```sh
SITE_URL=https://guilleojeda.com npm run verify
SITE_URL=https://guilleojeda.com npm run preview
```

`verify` runs type/content checks, focused tests, a production build, and checks of the generated output. `preview` serves that build locally. GitHub uses the same verification command with the deployed origin configured in repository variables.

## Update content

Edit the small files in `src/content/`:

| File | Content |
| --- | --- |
| `profile.json` | Bio, role, community activities, course, interface copy, primary links, and metadata |
| `projects.json` | Selected work and its destinations |
| `talks.json` | Talks, workshops, hosting, podcasts, training, and video appearances; highlight selection and public links |
| `books.json` | Authored books, descriptions, and per-book publication/status labels |

Keep common identifiers, dates, and URLs in each record once. Put the two translations beside each other under `en` and `es`. To add a talk or project, copy an existing record, give it a distinct ID, and update its facts, links, and both translations. Set a project’s `featured: true` to show a card; other projects appear in the compact work archive. Page components should not need edits. Publication titles can stay in their original language.

Every record in `talks.json` appears in the complete archive, grouped by its numeric `year`. Set `featured: true` for a highlight card; provide paired `event`, `format`, `title`, and `text`. A repeated talk at a different event is a separate record. Add `href` and a paired `cta` when a public recording, deck, or event page exists; otherwise omit both. A missing recording does not require omitting a supported appearance.

Use `format` and the description to distinguish speaking, hosting, and video commentary. Hosting an event does not imply presenting its guest talks, and reacting to a keynote does not imply speaking at the conference. Label announced sessions as scheduled until delivery is confirmed. White papers belong in `projects.json`, with the author or co-author role stated explicitly. If an old publication URL redirects to a different edition, use a reliable link to the original edition or its author announcement.

Community leadership and organizing records are in `profile.json` → `about.activities`. Book `meta` labels distinguish published work from a book in progress. The historical course lives under `authorship.courseTitle`, `courseMeta`, and `courseText`; its unavailable status should remain accurate.

For a role change, update the paired copy in `profile.json`: `hero.intro` (opening bio), `about.intro`, `about.facts[0].value` (Now row), and `site.title`/`site.description` (metadata). `hero.roleContext` controls the organization/team label. These are editable prose, so update both languages together.

The portrait and other public assets live in the repository. Keep alternative text accurate when replacing an image. Do not add uncertain release dates, availability claims, or live audience counts without confirming them.

### Content statistics

The Articles card counts the covered Caylent author inventory, with independent All · English · Español content filtering. Its number is cumulative; it does not claim complete career coverage or article readership. The source and last successful collection date accompany the count. Statistics require JavaScript; the rest of the site works without it.

`public/_content-stats/inputs.json` is the authoritative collector configuration. Astro copies it into the normal build artifact, and site CI uploads it. It contains the public Caylent delivery key, author selector and confirmed originality/language policy; **never add private credentials or raw provider data**. CloudFront denies access to `/_content-stats/*` in production. A source policy correction uses ordinary site CI and takes effect on the next collection. Publishing another eligible article at Caylent needs no repository change.

The Lambda alone writes `content-stats/v1/current.json`. Site CI cannot overwrite it, and rejects build artifacts containing that prefix. A complete successful refresh replaces the object; a source, validation or storage failure keeps the prior object with its original coverage and date. A first-ever failed collection leaves statistics unavailable. JSON revalidates through CloudFront, so daily updates need no invalidation or website rebuild.

Run `npm run verify` with `SITE_URL` set before publishing a content change. See [the website behavior](docs/intent/website.md) for the content and operating decisions.

## AWS setup

Infrastructure is defined in `infra/template.json`. `infra/cloudfront-routing.js` and `infra/content-stats-collector.cjs` are the authoritative function sources; the renderer embeds them into a deployable template so there is no second copy to maintain. Collector code and resource changes use this operator path; ordinary site/configuration edits use GitHub Actions.

Use a temporary AWS operator session for the intended account and `us-east-1`. Inspect the existing GitHub OIDC provider before setup:

```sh
aws sts get-caller-identity
aws iam list-open-id-connect-providers
```

If the account already has the provider for `https://token.actions.githubusercontent.com`, pass its ARN as `GitHubOidcProviderArn`. Do not create another provider or replace one owned by another application. If none exists, the stack can create it with `CreateOidcProviderIfMissing=true`.

For a new provider:

```sh
guille_stack_template="$(mktemp)"
node scripts/render-infra.mjs --output "$guille_stack_template"
aws cloudformation validate-template --template-body "file://$guille_stack_template" --region us-east-1
aws cloudformation deploy \
  --stack-name guilleojeda-website \
  --template-file "$guille_stack_template" \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides CreateOidcProviderIfMissing=true
rm "$guille_stack_template"
```

For reuse, replace the parameter override with `GitHubOidcProviderArn=YOUR_EXISTING_PROVIDER_ARN`. Keep the same provider choice on later stack updates. Setup creates private storage, CloudFront routing/cache configuration, and a restricted site-deployment role. It does not upload the site.

Read the outputs after the stack finishes:

```sh
aws cloudformation describe-stacks \
  --stack-name guilleojeda-website \
  --region us-east-1 \
  --query 'Stacks[0].Outputs' \
  --output table
```

Configure these GitHub Actions **repository variables**:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `AWS_ROLE_ARN` | `DeploymentRoleArn` output |
| `S3_BUCKET` | `BucketName` output |
| `CLOUDFRONT_DISTRIBUTION_ID` | `DistributionId` output |
| `SITE_URL` | `https://guilleojeda.com` |

These values are identifiers, not credentials. For example, `gh variable set AWS_REGION --body us-east-1`. GitHub assumes the deployment role through OIDC; do not add AWS access-key secrets to the repository.

### Collector operation

EventBridge Scheduler invokes the collector daily at **09:15 America/Argentina/Cordoba**, with no flexible window. The Node 24 Lambda has a five-minute timeout and 30-day log retention. Provider requests have a ten-second deadline and one transient retry; pagination is capped at 100 pages of ten records. Reaching the cap fails the refresh rather than publishing an incomplete count. Scheduler delivery and Lambda asynchronous execution each allow one retry within one hour.

The collector uses shared regional Lambda concurrency. Each invocation recomputes a complete snapshot from current source data and replaces the aggregate object. If invocations overlap, the one that finishes last can publish an older complete snapshot.

The stack exposes `ContentStatsFunctionName`, `ContentStatsScheduleName` and `ContentStatsScheduleGroupName`. Inspect the current stack outputs and schedule before operating it. After infrastructure and normal site/configuration publication, invoke the actual deployed function for initial output or to verify a repair:

```sh
guille_stats_function="$(aws cloudformation describe-stacks \
  --stack-name guilleojeda-website --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ContentStatsFunctionName`].OutputValue | [0]' \
  --output text)"
aws lambda invoke --function-name "$guille_stats_function" \
  --region us-east-1 /tmp/guille-content-stats-result.json
cat /tmp/guille-content-stats-result.json
```

Check both the invocation metadata for `FunctionError` and the response body, then inspect the public JSON and both language pages. A manual invocation recomputes from current inputs/source data; it never increments the old total or uses a scheduled event's old timestamp. Logs identify successful counts/pages/dates or sanitized failure codes without recording provider bodies or delivery keys.

For recovery, inspect the named function's CloudWatch log group, correct the source configuration through normal CI or correct runtime/infrastructure through CloudFormation, then invoke again. Do not repair numbers by manually uploading JSON. Retained values keep their old date until a complete refresh succeeds. An incompatible input/schema version fails explicitly; coordinate version changes with the collector and browser. No private analytics authorization is required for this Caylent inventory collector.

## Publish and recover

Pull requests verify and build. A push to `main` verifies, packages the exact build artifact, and deploys it through the main-only AWS role. Deployment uploads assets before HTML, retains old hashed assets, invalidates CloudFront, and checks the live English and Spanish pages. A superseded push does not overwrite a newer commit. Missing variables and failed checks fail explicitly.

Infrastructure updates use the versioned CloudFormation template under the operator session. Normal site updates use CI; do not manually upload `dist/` to bypass the workflow.

If a deployment fails, inspect the failing Actions step and its error before retrying. After repairing an upload or invalidation failure, rerun the workflow for the current intended commit. The operations are repeatable, but multi-object uploads are not atomic, so a failed run may leave mixed files until the successful retry.

To roll back a published content/code change, revert its commit on `main` and let the same workflow publish the revert. Old hashed assets are retained for cached pages and rollback. Do not delete them merely because they are absent from the latest build.

## Domain operations and recovery

The existing `guilleojeda-website` stack in `us-east-1` owns the Route 53 zone, DNS records, ACM certificate, and CloudFront configuration. Apply infrastructure updates with the render/validate/deploy commands above, preserving the stack's OIDC parameters. The production zone is `Z08987431TLTN2P7IRTQJ`; registration remains at GoDaddy. Edit DNS records in `infra/template.json` and apply the stack so the repository stays authoritative. The content-deployment role cannot change DNS.

The certificate covers `guilleojeda.com` and `www.guilleojeda.com`. ACM creates its validation CNAMEs in the zone; keep those records for automatic renewal. Wait for a completed stack update and CloudFront deployment before treating a certificate or routing change as live.

If recreating the zone, first inventory the currently authoritative DNS and check DNSSEC/parent DS state. The current template can wait for certificate validation until the new zone is delegated. While it is pending, retrieve the zone ID with `aws cloudformation describe-stack-resource --stack-name guilleojeda-website --logical-resource-id SiteHostedZone --region us-east-1`, then inspect its nameservers and records with `aws route53 get-hosted-zone` and `aws route53 list-resource-record-sets`. Compare every unrelated record before changing only the nameserver delegation at GoDaddy. Public certificate validation and dependent website aliases can then complete. Do not create a second live zone or change registration during an ordinary update.

For a web-only infrastructure rollback, apply the reviewed previous CloudFormation configuration. Content rollbacks use the Git revert workflow above. A DNS-provider rollback requires the previous provider's complete zone to still exist and serve correct records; verify it before restoring its delegation. The prelaunch nameservers were `ns03.domaincontrol.com` and `ns04.domaincontrol.com`. Keep the Route 53 zone, bucket, and old hashed assets during recovery.

Blog, mail, verification, and other unrelated records remain under the same names. Normal content deployments use `SITE_URL=https://guilleojeda.com` and do not change DNS or infrastructure.
